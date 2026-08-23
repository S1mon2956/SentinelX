-- Phase 29: close role/scope escalation gap in site_memberships UPDATE
--
-- "memberships manager decide" (phase7) had a USING clause but no explicit
-- WITH CHECK, so Postgres defaulted the check to the same USING predicate.
-- That predicate only validates site_id/company_id on the row being
-- written — it never inspects `role` at all. Confirmed live: a
-- company_manager can PATCH their own row's role to site_manager (or any
-- app_role value) and immediately gain the wider access that role
-- carries elsewhere (roster visibility, approve/reject authority,
-- inspections scope) — a genuine privilege escalation, not just a
-- data-scoping gap.
--
-- Fix: explicit WITH CHECK that pins the writable role to what the
-- caller's own authority actually permits, and pins site_id/company_id
-- to stay within scope (making the previously-incidental constraint
-- explicit and independent of USING's defaulting behavior).

drop policy if exists "memberships manager decide" on site_memberships;

create policy "memberships manager decide" on site_memberships for update
  using (
    is_super_admin()
    or is_full_site_manager(site_id)
    or is_company_manager_for(site_id, company_id)
  )
  with check (
    is_super_admin()
    or (
      is_full_site_manager(site_id)
      and role in ('site_manager', 'company_manager', 'user', 'external_reviewer')
    )
    or (
      is_company_manager_for(site_id, company_id)
      and role in ('user', 'external_reviewer')
    )
  );
