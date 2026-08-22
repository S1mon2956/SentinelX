-- Phase 22: scope inspection deletion to draft owner / site manager
--
-- The old "inspections write" policy was `for all`, which covers
-- SELECT/INSERT/UPDATE/DELETE with one check. In practice that meant any
-- approved user on a site could delete ANY inspection, regardless of
-- status or ownership — a pre-existing gap, not something introduced
-- here. This migration splits that policy into command-specific ones.
-- Insert/update keep the exact same access as before; only DELETE is
-- narrowed.

drop policy if exists "inspections write" on inspections;

create policy "inspections insert" on inspections for insert
  with check (is_super_admin() or is_approved_on_site(site_id));

create policy "inspections update" on inspections for update
  using (is_super_admin() or is_approved_on_site(site_id))
  with check (is_super_admin() or is_approved_on_site(site_id));

-- Only draft inspections can be deleted, and only by the inspector who
-- owns the draft, a manager for the site, or a super admin. Once an
-- inspection is submitted/reviewed/approved it becomes a compliance
-- record and this policy no longer matches it — there is deliberately
-- no delete path for non-draft status.
create policy "inspections delete" on inspections for delete
  using (
    status = 'draft'
    and (
      is_super_admin()
      or inspector_id = auth.uid()
      or is_full_site_manager(site_id)
      or is_company_manager_for(site_id, company_id)
    )
  );
