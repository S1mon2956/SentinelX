-- Phase 30: fix cross-company leak in induction submission / upload / storage access
--
-- is_manager_of_site_membership() and is_manager_of_site_membership_induction()
-- both OR'd in is_manager_on_site(), which checks role IN ('site_manager',
-- 'company_manager') scoped only to site_id — no company_id comparison.
-- Confirmed live: a company_manager for Company A could approve/reject/
-- request-more-info on Company B's induction, and pull a working signed
-- URL for Company B's uploaded signature, via storage.objects' SELECT
-- policy (which calls is_manager_of_site_membership_induction()
-- directly).
--
-- Fix: swap is_manager_on_site() for is_full_site_manager() +
-- is_company_manager_for() inside these two helpers only.
-- is_manager_on_site() itself is untouched — it's correctly used
-- as-is by site_inductions / site_induction_declarations, which are
-- genuinely site-wide content with no company_id to scope against.

create or replace function public.is_manager_of_site_membership(check_site_membership_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships sm
    where sm.id = check_site_membership_id
      and (
        public.is_super_admin()
        or public.is_full_site_manager(sm.site_id)
        or public.is_company_manager_for(sm.site_id, sm.company_id)
      )
  );
$$;

create or replace function public.is_manager_of_site_membership_induction(check_induction_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from site_membership_inductions smi
    join site_memberships sm on sm.id = smi.site_membership_id
    where smi.id = check_induction_id
      and (
        public.is_super_admin()
        or public.is_full_site_manager(sm.site_id)
        or public.is_company_manager_for(sm.site_id, sm.company_id)
      )
  );
$$;
