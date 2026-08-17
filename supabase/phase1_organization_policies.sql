-- Phase 1 follow-up: RLS policies for the Organization management page.
-- organizations, clients, and site_companies were enabled for RLS in
-- schema.sql but never given policies — with RLS on and no policy, every
-- read/write is denied by default, which is why the Organization page
-- reports "No organization found" even when the row exists.
-- Run once in the Supabase SQL editor, after phase1_tighten_policies.sql.

-- ============================================================
-- organizations / clients / site_companies — only the Organization page
-- touches these right now, and it's already gated to super admins in the
-- nav, so keep these super-admin-only for both read and write.
-- ============================================================

drop policy if exists "organizations select" on organizations;
create policy "organizations select" on organizations
  for select using (is_super_admin());

drop policy if exists "organizations write" on organizations;
create policy "organizations write" on organizations
  for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists "clients select" on clients;
create policy "clients select" on clients
  for select using (is_super_admin());

drop policy if exists "clients write" on clients;
create policy "clients write" on clients
  for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists "site_companies select" on site_companies;
create policy "site_companies select" on site_companies
  for select using (is_super_admin());

drop policy if exists "site_companies write" on site_companies;
create policy "site_companies write" on site_companies
  for all using (is_super_admin()) with check (is_super_admin());
