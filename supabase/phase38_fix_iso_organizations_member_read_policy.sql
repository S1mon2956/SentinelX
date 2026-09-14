-- Phase 38: fix ambiguous column reference in "Members read own organization"
--
-- The bare `id` in phase37's iso_organizations SELECT policy is shadowed by
-- iso_organization_memberships.id (aliased m) inside the EXISTS subquery,
-- so the policy compares m.iso_organization_id to m.id instead of
-- iso_organizations.id — meaning no client member could ever read their
-- own org row. Confirmed live via a real session for both a 'member' and
-- a 'restricted' test user, both returning zero rows for their own org.

drop policy if exists "Members read own organization" on iso_organizations;
create policy "Members read own organization" on iso_organizations
  for select using (
    exists (
      select 1 from iso_organization_memberships m
      where m.iso_organization_id = iso_organizations.id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );
