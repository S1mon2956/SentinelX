-- Phase 31: scope sites SELECT to approved membership
--
-- The live "sites read" policy (originally from phase1_rls_consolidated.sql)
-- used `auth.uid() is not null` — any authenticated user could read every
-- site row regardless of membership, unlike observations/assets/incidents/
-- answers, which all scope via is_approved_on_site(site_id). Applied live
-- directly via the SQL Editor during this review; this migration brings
-- the repo history in line with what's actually running.

drop policy if exists "sites read" on sites;
create policy "sites read" on sites for select
  using (is_super_admin() or is_approved_on_site(id));
