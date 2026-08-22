-- Phase 19: pin search_path on functions Advisors flagged as
-- function_search_path_mutable. Pure hardening — no logic changes, no
-- access-rule changes. Matches the `set search_path = public` pattern
-- already used on newer functions (phase1_rls_consolidated.sql, phase13).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create or replace function prevent_self_promote()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not is_super_admin() and new.is_super_admin is distinct from old.is_super_admin then
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_inspection_separation_of_duties()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  action text;
begin
  -- Only the two sign-off transitions are guarded. draft -> submitted is the
  -- inspector's own step and must keep working for them.
  if new.status = old.status or new.status not in ('reviewed', 'approved') then
    return new;
  end if;

  action := case when new.status = 'reviewed' then 'review' else 'approve' end;

  -- Escape valve for genuine backend contexts (SQL editor, migrations): those
  -- carry no PostgREST request context at all. Browser traffic ALWAYS sets
  -- request.jwt.claims, so a missing auth.uid() with claims present is a
  -- malformed user request and gets rejected below rather than waved through.
  if current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  if actor is null then
    raise exception 'You must be signed in to % an inspection.', action
      using errcode = 'check_violation';
  end if;

  -- Separation of duties. This deliberately applies to super admins as well:
  -- an audit record where the same person did the work and signed it off is
  -- worthless, and "I was the only admin" is not a defence in an ISO audit.
  if actor = old.inspector_id then
    raise exception 'You cannot % an inspection you carried out yourself.', action
      using errcode = 'check_violation';
  end if;

  if not (
    is_super_admin()
    or is_full_site_manager(old.site_id)
    or is_company_manager_for(old.site_id, old.company_id)
  ) then
    raise exception 'Only a manager for this site can % an inspection.', action
      using errcode = 'check_violation';
  end if;

  -- Stamp the actor server-side so reviewed_by / approved_by record who
  -- really did it, rather than whatever the client sent.
  if new.status = 'reviewed' then
    new.reviewed_by := actor;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  else
    new.approved_by := actor;
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  return new;
end;
$$;
