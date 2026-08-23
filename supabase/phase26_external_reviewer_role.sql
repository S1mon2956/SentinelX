-- Phase 26: external reviewer role, so a single-manager site can still
-- get inspections reviewed/approved by someone other than the inspector.
--
-- The real gate this needs to clear is the phase10/phase19
-- enforce_inspection_separation_of_duties() trigger, not the app-level
-- canReview check — that trigger is what actually blocks reviewed/
-- approved transitions today. external_reviewer is scoped per-site
-- (company_id null — this role isn't tied to a contractor company) and
-- gets no incidental permissions: is_manager_on_site/is_full_site_manager/
-- is_company_manager_for all check role against an explicit list, so a
-- new role value is invisible to them unless wired in deliberately below.
--
-- Run STEP 1 ALONE first — Postgres will not let a newly added enum
-- value be used within the same transaction it was added in, so STEP 2
-- must be run as a separate execution after STEP 1 has succeeded.

-- ============================================================
-- STEP 1 — run this alone, nothing else in the same execution.
-- ============================================================

alter type app_role add value 'external_reviewer';

-- ============================================================
-- STEP 2 — run only after STEP 1 has succeeded on its own.
-- ============================================================

create or replace function is_external_reviewer_for(check_site_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where user_id = auth.uid()
      and site_id = check_site_id
      and role = 'external_reviewer'
      and status = 'approved'
  );
$$;

-- Resolves an email to a user_id, scoped so only a manager on the target
-- site can use it. The authorization check is ANDed into the WHERE
-- clause rather than a leading guard, so an unauthorized caller and a
-- "no such user" caller get the identical empty result — no error to
-- distinguish "you're not allowed" from "that email doesn't exist",
-- which is what stops this being an email-enumeration surface.
create or replace function find_user_by_email(target_site_id uuid, target_email text)
returns table(user_id uuid)
language sql security definer stable
set search_path = public
as $$
  select id from users
  where lower(email) = lower(trim(target_email))
    and (is_super_admin() or is_full_site_manager(target_site_id));
$$;

-- Locked down, unlike is_external_reviewer_for: this one resolves
-- arbitrary emails to account existence, so EXECUTE must not default to
-- PUBLIC. is_external_reviewer_for stays open — it's invoked inline by
-- RLS policies and the trigger below the same way is_approved_on_site is
-- elsewhere, and carries no information disclosure risk of its own.
revoke execute on function find_user_by_email(uuid, text) from public, anon;
grant execute on function find_user_by_email(uuid, text) to authenticated;

-- Extends the separation-of-duties trigger to also accept an approved
-- external reviewer for the site. Everything else about this function is
-- unchanged from phase19.
create or replace function public.enforce_inspection_separation_of_duties()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  action text;
begin
  if new.status = old.status or new.status not in ('reviewed', 'approved') then
    return new;
  end if;

  action := case when new.status = 'reviewed' then 'review' else 'approve' end;

  if current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  if actor is null then
    raise exception 'You must be signed in to % an inspection.', action
      using errcode = 'check_violation';
  end if;

  if actor = old.inspector_id then
    raise exception 'You cannot % an inspection you carried out yourself.', action
      using errcode = 'check_violation';
  end if;

  if not (
    is_super_admin()
    or is_full_site_manager(old.site_id)
    or is_company_manager_for(old.site_id, old.company_id)
    or is_external_reviewer_for(old.site_id)
  ) then
    raise exception 'Only a manager or assigned reviewer for this site can % an inspection.', action
      using errcode = 'check_violation';
  end if;

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

-- New capability: today the only INSERT path into site_memberships is
-- the public self-service /join flow (always role='user', status
-- 'pending'). This is the first manager-initiated insert, so it's
-- narrowly scoped: only ever creates an approved, company_id-null
-- external_reviewer row, and only a super admin or a full site manager
-- (not a company manager — external reviewers are site-wide, not
-- company-scoped) can use it.
--
-- Collision safety does NOT rely on the unique(user_id, site_id,
-- company_id) constraint — Postgres treats multiple NULLs in a unique
-- constraint as distinct, not equal, and company_id is null on both a
-- self-service "None / not sure" membership and every external_reviewer
-- row, so that constraint would silently fail to catch the exact
-- collision this is most likely to hit. The explicit not exists check
-- below, keyed on user_id + site_id only, is what actually enforces the
-- refusal: if the target user already has any membership row on this
-- site, the insert is rejected — reconciling an existing membership's
-- role/company assignment is a manual decision for the manager, not
-- something this policy silently resolves.
create policy "Managers can add external reviewers" on site_memberships
  for insert
  with check (
    role = 'external_reviewer'
    and status = 'approved'
    and company_id is null
    and (is_super_admin() or is_full_site_manager(site_id))
    and not exists (
      select 1 from site_memberships existing
      where existing.user_id = site_memberships.user_id
        and existing.site_id = site_memberships.site_id
    )
  );
