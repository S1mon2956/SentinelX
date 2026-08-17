-- Closes the self-approval loophole: a manager who carried out an inspection
-- could review and approve their own work, because the only guard was a
-- client-side role check and the "inspections write" RLS policy lets any
-- approved user on the site update any column (including status).
--
-- RLS alone can't express this rule — deciding whether a status change is
-- legitimate needs to compare OLD.status against NEW.status, which a policy
-- can't see. So this is a BEFORE UPDATE trigger instead.
--
-- Run in the Supabase SQL Editor. Expect "Success. No rows returned".

create or replace function public.enforce_inspection_separation_of_duties()
returns trigger
language plpgsql
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
  -- (The previous version trusted "auth.uid() is null" on its own, which would
  -- have exempted exactly the requests it was meant to police.)
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

-- SECURITY INVOKER (the default) is deliberate: the function needs no elevated
-- privileges of its own, and under SECURITY DEFINER `current_user` silently
-- becomes the function owner, which makes caller-identity checks misleading.
-- The is_* helpers it calls are themselves SECURITY DEFINER already.

drop trigger if exists inspections_separation_of_duties on inspections;
create trigger inspections_separation_of_duties
  before update on inspections
  for each row
  execute function public.enforce_inspection_separation_of_duties();
