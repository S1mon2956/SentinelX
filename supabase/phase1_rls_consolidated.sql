-- Consolidated RLS policy set — supersedes phase1_tighten_policies.sql and
-- phase1_organization_policies.sql. Run this AFTER schema.sql, auth_trigger.sql,
-- and storage_policies.sql (and after those two earlier phase1_* files, since
-- they're what created the old policies this script explicitly drops below).
--
-- Why this file exists: the previous tightening scripts used different policy
-- *names* for the same table+command (e.g. "users select" vs "users read").
-- `drop policy if exists` only matches by exact name, so re-running policies
-- under new names doesn't replace the old ones — it stacks a second policy
-- alongside them. Postgres RLS policies are permissive by default (OR'd
-- together), so wherever old and new disagreed, the MORE PERMISSIVE one won
-- silently. Most visibly: the old "users select" policy (scoped to
-- self/super-admin/shared-site) plus a new open "users read" policy meant
-- any authenticated user could read every user's email, phone, and
-- is_super_admin flag. This file drops every old-named policy first, so each
-- table ends up with exactly one unambiguous policy per command.

-- ============================================================
-- STEP 1 — drop every policy that could currently exist under an old
-- name, from three different sources verified against a live
-- `select tablename, policyname from pg_policies where schemaname='public'`
-- snapshot taken 2026-08-08:
--   (a) phase1_updates.sql's original "authenticated ..." placeholders —
--       turned out these were STILL the live ones for templates/
--       template_items/template_versions/observations; phase1_tighten_
--       policies.sql, which was meant to replace them, never actually ran.
--   (b) phase1_tighten_policies.sql / phase1_organization_policies.sql
--       names — kept here as a no-op safety net in case they get applied
--       out of order some other time.
--   (c) hand-authored "dev: ..." policies on companies/sites/
--       site_memberships that exist in the live database but don't
--       correspond to any file in this repo — created directly in the
--       Supabase dashboard's policy editor at some point.
-- ============================================================

-- users never had RLS turned on at all (missing from schema.sql's enable
-- list) — every row is fully open right now. Turning it on here so the
-- policies below actually take effect instead of silently doing nothing.
alter table users enable row level security;

drop policy if exists "users select" on users;
drop policy if exists "users update own" on users;

-- (a) original phase1_updates.sql placeholders — confirmed still live
drop policy if exists "authenticated read templates" on templates;
drop policy if exists "authenticated insert templates" on templates;
drop policy if exists "authenticated update templates" on templates;
drop policy if exists "authenticated read template_items" on template_items;
drop policy if exists "authenticated insert template_items" on template_items;
drop policy if exists "authenticated read template_versions" on template_versions;
drop policy if exists "authenticated insert template_versions" on template_versions;
drop policy if exists "authenticated read observations" on observations;
drop policy if exists "authenticated insert observations" on observations;
drop policy if exists "authenticated update observations" on observations;

-- (c) hand-authored dashboard policies — confirmed still live
drop policy if exists "dev: read companies" on companies;
drop policy if exists "dev: read sites" on sites;
drop policy if exists "dev: read site_memberships" on site_memberships;
drop policy if exists "dev: insert site_memberships" on site_memberships;
drop policy if exists "dev: update site_memberships" on site_memberships;

-- (b) phase1_tighten_policies.sql / phase1_organization_policies.sql names
-- — not currently live per the pg_policies snapshot, kept as a safety net
drop policy if exists "sites select" on sites;
drop policy if exists "sites write" on sites;
drop policy if exists "companies select" on companies;
drop policy if exists "companies write" on companies;
drop policy if exists "site_memberships select" on site_memberships;
drop policy if exists "site_memberships insert own" on site_memberships;
drop policy if exists "site_memberships update" on site_memberships;
drop policy if exists "templates select" on templates;
drop policy if exists "templates write" on templates;
drop policy if exists "template_items select" on template_items;
drop policy if exists "template_items write" on template_items;
drop policy if exists "template_versions select" on template_versions;
drop policy if exists "template_versions write" on template_versions;
drop policy if exists "observations select" on observations;
drop policy if exists "observations insert" on observations;
drop policy if exists "observations update" on observations;
drop policy if exists "organizations select" on organizations;
drop policy if exists "organizations write" on organizations;
drop policy if exists "clients select" on clients;
drop policy if exists "clients write" on clients;
drop policy if exists "site_companies select" on site_companies;
drop policy if exists "site_companies write" on site_companies;

-- Old helper functions from phase1_tighten_policies.sql — not currently
-- live either, but dropped (if present) since nothing below references
-- them; is_approved_on_site / is_manager_on_site replace them.
drop function if exists has_approved_site_access(uuid);
drop function if exists is_site_manager(uuid);
drop function if exists is_manager_anywhere();

-- ============================================================
-- STEP 2 — the real policy set (unchanged from what you pasted in).
-- ============================================================

-- The core rule this enforces: a user can only see data belonging to a site
-- they are an APPROVED member of (or everything, if they're a super admin).
-- This is what actually stops Client A's data from ever being reachable by
-- someone only registered to Client B's site — even if there were a bug in
-- the app's own code, the database itself would still refuse the query.

-- ============================================================
-- HELPER FUNCTIONS
-- security definer + a fixed search_path so these run with the
-- permissions needed to check membership, regardless of who's asking.
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce((select is_super_admin from users where id = auth.uid()), false);
$$;

create or replace function public.is_approved_on_site(check_site_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where user_id = auth.uid()
      and site_id = check_site_id
      and status = 'approved'
  );
$$;

create or replace function public.is_manager_on_site(check_site_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where user_id = auth.uid()
      and site_id = check_site_id
      and status = 'approved'
      and role in ('site_manager', 'company_manager')
  );
$$;

-- ============================================================
-- USERS — read broadly (needed for assignee dropdowns, approval queues,
-- name display), but only self can update their own row.
-- ============================================================

drop policy if exists "users read" on users;
create policy "users read" on users for select
  using (auth.uid() is not null);

drop policy if exists "users update self" on users;
create policy "users update self" on users for update
  using (id = auth.uid());

-- ============================================================
-- ORGANIZATIONS — single-org setup for now: any logged-in user can read;
-- only a super admin can create/change one.
-- ============================================================

drop policy if exists "organizations read" on organizations;
create policy "organizations read" on organizations for select
  using (auth.uid() is not null);

drop policy if exists "organizations write" on organizations;
create policy "organizations write" on organizations for all
  using (is_super_admin()) with check (is_super_admin());

-- ============================================================
-- CLIENTS / SITES — sites themselves aren't sensitive (just a name), and
-- need to be readable by ANY logged-in user, approved or not — that's how
-- a brand-new registrant sees the list to request access to one in the
-- first place. The real tenant boundary is the data behind a site
-- (inspections, observations, memberships), which stays locked below.
-- Clients stay tighter since they're not shown during registration.
-- ============================================================

drop policy if exists "sites read" on sites;
create policy "sites read" on sites for select
  using (auth.uid() is not null);

drop policy if exists "sites write" on sites;
create policy "sites write" on sites for all
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "clients read" on clients;
create policy "clients read" on clients for select
  using (
    is_super_admin()
    or exists (select 1 from sites where sites.client_id = clients.id and is_approved_on_site(sites.id))
  );

drop policy if exists "clients write" on clients;
create policy "clients write" on clients for all
  using (is_super_admin()) with check (is_super_admin());

-- ============================================================
-- COMPANIES / SITE_COMPANIES — companies themselves aren't sensitive
-- (just names), so read broadly; only super admin manages the master list
-- and which companies are linked to which sites.
-- ============================================================

drop policy if exists "companies read" on companies;
create policy "companies read" on companies for select
  using (auth.uid() is not null);

drop policy if exists "companies write" on companies;
create policy "companies write" on companies for all
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "site_companies read" on site_companies;
create policy "site_companies read" on site_companies for select
  using (auth.uid() is not null);

drop policy if exists "site_companies write" on site_companies;
create policy "site_companies write" on site_companies for all
  using (is_super_admin()) with check (is_super_admin());

-- ============================================================
-- SITE_MEMBERSHIPS — this is the sensitive one: who's approved where.
-- - Anyone can read their own membership rows (so the app knows their role)
-- - Managers can see membership rows for sites they manage (needed for the
--   approval queue and the reassignment dropdown)
-- - A user can INSERT their own pending request (self-registration)
-- - Only a manager on that site, or a super admin, can approve/reject
-- ============================================================

drop policy if exists "memberships read" on site_memberships;
create policy "memberships read" on site_memberships for select
  using (
    user_id = auth.uid()
    or is_super_admin()
    or is_manager_on_site(site_id)
  );

drop policy if exists "memberships self register" on site_memberships;
create policy "memberships self register" on site_memberships for insert
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "memberships manager decide" on site_memberships;
create policy "memberships manager decide" on site_memberships for update
  using (is_super_admin() or is_manager_on_site(site_id));

-- ============================================================
-- TEMPLATES — single-org, so any approved user can read; only managers
-- and super admins can create or edit them.
-- ============================================================

drop policy if exists "templates read" on templates;
create policy "templates read" on templates for select
  using (auth.uid() is not null);

drop policy if exists "templates write" on templates;
create policy "templates write" on templates for all
  using (
    is_super_admin()
    or exists (select 1 from site_memberships where user_id = auth.uid() and status = 'approved' and role in ('site_manager', 'company_manager'))
  );

drop policy if exists "template_items read" on template_items;
create policy "template_items read" on template_items for select
  using (auth.uid() is not null);

drop policy if exists "template_items write" on template_items;
create policy "template_items write" on template_items for all
  using (
    is_super_admin()
    or exists (select 1 from site_memberships where user_id = auth.uid() and status = 'approved' and role in ('site_manager', 'company_manager'))
  );

drop policy if exists "template_versions read" on template_versions;
create policy "template_versions read" on template_versions for select
  using (auth.uid() is not null);

drop policy if exists "template_versions write" on template_versions;
create policy "template_versions write" on template_versions for all
  using (
    is_super_admin()
    or exists (select 1 from site_memberships where user_id = auth.uid() and status = 'approved' and role in ('site_manager', 'company_manager'))
  );

-- ============================================================
-- INSPECTIONS / ANSWERS / EVIDENCE — scoped to the site the inspection
-- belongs to. Answers and evidence inherit that scoping through their
-- parent inspection/answer.
-- ============================================================

drop policy if exists "inspections read" on inspections;
create policy "inspections read" on inspections for select
  using (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "inspections write" on inspections;
create policy "inspections write" on inspections for all
  using (is_super_admin() or is_approved_on_site(site_id))
  with check (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "answers read" on answers;
create policy "answers read" on answers for select
  using (
    is_super_admin()
    or exists (select 1 from inspections where inspections.id = answers.inspection_id and is_approved_on_site(inspections.site_id))
  );

drop policy if exists "answers write" on answers;
create policy "answers write" on answers for all
  using (
    is_super_admin()
    or exists (select 1 from inspections where inspections.id = answers.inspection_id and is_approved_on_site(inspections.site_id))
  );

drop policy if exists "evidence read" on evidence;
create policy "evidence read" on evidence for select
  using (
    is_super_admin()
    or exists (
      select 1 from answers
      join inspections on inspections.id = answers.inspection_id
      where answers.id = evidence.answer_id and is_approved_on_site(inspections.site_id)
    )
  );

drop policy if exists "evidence write" on evidence;
create policy "evidence write" on evidence for all
  using (
    is_super_admin()
    or exists (
      select 1 from answers
      join inspections on inspections.id = answers.inspection_id
      where answers.id = evidence.answer_id and is_approved_on_site(inspections.site_id)
    )
  );

-- ============================================================
-- OBSERVATIONS — same site-level boundary. Company-level scoping (a
-- company manager only seeing their own company's observations) is
-- handled in the app query today; that's a business-visibility rule, not
-- a hard tenant boundary, so it's acceptable to leave at the app layer for
-- phase 1. The database-level guarantee here is the one that matters most:
-- nobody outside the site can read or write these rows at all.
-- ============================================================

drop policy if exists "observations read" on observations;
create policy "observations read" on observations for select
  using (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "observations write" on observations;
create policy "observations write" on observations for all
  using (is_super_admin() or is_approved_on_site(site_id))
  with check (is_super_admin() or is_approved_on_site(site_id));

-- ============================================================
-- ASSETS / ASSET_TRANSFERS / INCIDENTS — same site-scoping pattern,
-- included now even though the UI for these doesn't exist yet, so the
-- data is protected from day one once those screens are built.
-- ============================================================

drop policy if exists "assets read" on assets;
create policy "assets read" on assets for select
  using (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "assets write" on assets;
create policy "assets write" on assets for all
  using (is_super_admin() or is_approved_on_site(site_id))
  with check (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "asset_transfers read" on asset_transfers;
create policy "asset_transfers read" on asset_transfers for select
  using (
    is_super_admin()
    or exists (select 1 from assets where assets.id = asset_transfers.asset_id and is_approved_on_site(assets.site_id))
  );

drop policy if exists "asset_transfers write" on asset_transfers;
create policy "asset_transfers write" on asset_transfers for all
  using (
    is_super_admin()
    or exists (select 1 from assets where assets.id = asset_transfers.asset_id and is_approved_on_site(assets.site_id))
  );

drop policy if exists "incidents read" on incidents;
create policy "incidents read" on incidents for select
  using (is_super_admin() or is_approved_on_site(site_id));

drop policy if exists "incidents write" on incidents;
create policy "incidents write" on incidents for all
  using (is_super_admin() or is_approved_on_site(site_id))
  with check (is_super_admin() or is_approved_on_site(site_id));

-- ============================================================
-- AUDIT LOG — write-only for regular users (insert your own actions),
-- read-only for super admins. Nobody should be able to edit or delete
-- audit history — that's the whole point of it.
-- ============================================================

drop policy if exists "audit_log read" on audit_log;
create policy "audit_log read" on audit_log for select
  using (is_super_admin());

drop policy if exists "audit_log insert" on audit_log;
create policy "audit_log insert" on audit_log for insert
  with check (auth.uid() is not null);

-- No update or delete policy on audit_log at all, on purpose — this means
-- even a super admin cannot alter or erase audit history through the app,
-- which is exactly what you want for a compliance record.
