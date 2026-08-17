-- Phase 1: replace the permissive "any authenticated user" placeholders
-- from phase1_updates.sql with real, scoped policies. Run once in the
-- Supabase SQL editor, after phase1_updates.sql.

-- ============================================================
-- Helper functions (security definer so they can read site_memberships /
-- users internally without recursing back into RLS on those tables).
-- ============================================================

create or replace function is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select u.is_super_admin from users u where u.id = auth.uid()), false);
$$;

create or replace function has_approved_site_access(target_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_super_admin() or exists (
    select 1 from site_memberships sm
    where sm.user_id = auth.uid()
      and sm.site_id = target_site_id
      and sm.status = 'approved'
  );
$$;

create or replace function is_site_manager(target_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_super_admin() or exists (
    select 1 from site_memberships sm
    where sm.user_id = auth.uid()
      and sm.site_id = target_site_id
      and sm.status = 'approved'
      and sm.role in ('site_manager', 'company_manager')
  );
$$;

create or replace function is_manager_anywhere()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_super_admin() or exists (
    select 1 from site_memberships sm
    where sm.user_id = auth.uid()
      and sm.status = 'approved'
      and sm.role in ('site_manager', 'company_manager')
  );
$$;

-- ============================================================
-- users — was NOT covered by RLS at all before this. Enabling it now.
-- ============================================================

alter table users enable row level security;

drop policy if exists "users select" on users;
create policy "users select" on users
  for select using (
    id = auth.uid()
    or is_super_admin()
    or exists ( -- share an approved site with the requester
      select 1 from site_memberships sm1
      join site_memberships sm2 on sm1.site_id = sm2.site_id
      where sm1.user_id = auth.uid() and sm1.status = 'approved'
        and sm2.user_id = users.id and sm2.status = 'approved'
    )
    or exists ( -- requester manages a site this user has a request on (any status)
      select 1 from site_memberships sm
      where sm.user_id = users.id
        and is_site_manager(sm.site_id)
    )
  );

drop policy if exists "users update own" on users;
create policy "users update own" on users
  for update using (id = auth.uid() or is_super_admin())
  with check (id = auth.uid() or is_super_admin());

-- Belt-and-braces: even if someone got an update through, they can't grant
-- themselves super admin unless they already are one.
create or replace function prevent_self_promote()
returns trigger
language plpgsql
as $$
begin
  if not is_super_admin() and new.is_super_admin is distinct from old.is_super_admin then
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists users_prevent_self_promote on users;
create trigger users_prevent_self_promote
  before update on users
  for each row execute function prevent_self_promote();

-- ============================================================
-- sites / companies — readable by any logged-in user (registration
-- dropdown, site switcher); writable only by super admins for now,
-- since there's no site/company management screen yet.
-- ============================================================

drop policy if exists "sites select" on sites;
create policy "sites select" on sites
  for select using (auth.role() = 'authenticated');

drop policy if exists "sites write" on sites;
create policy "sites write" on sites
  for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists "companies select" on companies;
create policy "companies select" on companies
  for select using (auth.role() = 'authenticated');

drop policy if exists "companies write" on companies;
create policy "companies write" on companies
  for all using (is_super_admin()) with check (is_super_admin());

-- ============================================================
-- site_memberships — see your own rows, or ones for sites you manage.
-- Insert only your own, always as 'pending' (no self-approval). Only a
-- manager of that site (or super admin) can update status.
-- ============================================================

drop policy if exists "site_memberships select" on site_memberships;
create policy "site_memberships select" on site_memberships
  for select using (
    user_id = auth.uid()
    or is_site_manager(site_id)
  );

drop policy if exists "site_memberships insert own" on site_memberships;
create policy "site_memberships insert own" on site_memberships
  for insert with check (
    user_id = auth.uid() and status = 'pending'
  );

drop policy if exists "site_memberships update" on site_memberships;
create policy "site_memberships update" on site_memberships
  for update using (is_site_manager(site_id))
  with check (is_site_manager(site_id));

-- ============================================================
-- templates / template_items / template_versions — readable by any
-- logged-in user, writable by managers/super admins only. (The "New
-- template" button in the UI isn't role-gated yet — a non-manager will
-- now get a real RLS error there until that's added.)
-- ============================================================

drop policy if exists "authenticated read templates" on templates;
drop policy if exists "authenticated insert templates" on templates;
drop policy if exists "authenticated update templates" on templates;
create policy "templates select" on templates
  for select using (auth.role() = 'authenticated');
create policy "templates write" on templates
  for all using (is_manager_anywhere()) with check (is_manager_anywhere());

drop policy if exists "authenticated read template_items" on template_items;
drop policy if exists "authenticated insert template_items" on template_items;
create policy "template_items select" on template_items
  for select using (auth.role() = 'authenticated');
create policy "template_items write" on template_items
  for all using (is_manager_anywhere()) with check (is_manager_anywhere());

drop policy if exists "authenticated read template_versions" on template_versions;
drop policy if exists "authenticated insert template_versions" on template_versions;
create policy "template_versions select" on template_versions
  for select using (auth.role() = 'authenticated');
create policy "template_versions write" on template_versions
  for all using (is_manager_anywhere()) with check (is_manager_anywhere());

-- ============================================================
-- observations — scoped to users with approved access to that site
-- (or super admins). Anyone with site access can raise, view, assign,
-- and close observations there.
-- ============================================================

drop policy if exists "authenticated read observations" on observations;
drop policy if exists "authenticated insert observations" on observations;
drop policy if exists "authenticated update observations" on observations;
create policy "observations select" on observations
  for select using (has_approved_site_access(site_id));
create policy "observations insert" on observations
  for insert with check (has_approved_site_access(site_id));
create policy "observations update" on observations
  for update using (has_approved_site_access(site_id))
  with check (has_approved_site_access(site_id));
