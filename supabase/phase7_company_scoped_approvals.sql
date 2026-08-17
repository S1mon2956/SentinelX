-- Fixes a real gap: company managers currently have full-site access to
-- site_memberships (same as site managers), meaning a contractor's company
-- manager could see and approve OTHER companies' people on the same site.
-- This restores the actual design rule: site managers see/manage everyone
-- on their site; company managers see/manage only their own company's
-- people on that site.
--
-- Run in the Supabase SQL Editor.

create or replace function public.is_full_site_manager(check_site_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where user_id = auth.uid()
      and site_id = check_site_id
      and status = 'approved'
      and role = 'site_manager'
  );
$$;

create or replace function public.is_company_manager_for(check_site_id uuid, check_company_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where user_id = auth.uid()
      and site_id = check_site_id
      and status = 'approved'
      and role = 'company_manager'
      and company_id is not distinct from check_company_id
  );
$$;

-- Replace the two site_memberships policies that were using the old,
-- too-broad is_manager_on_site check.

drop policy if exists "memberships read" on site_memberships;
create policy "memberships read" on site_memberships for select
  using (
    user_id = auth.uid()
    or is_super_admin()
    or is_full_site_manager(site_id)
    or is_company_manager_for(site_id, company_id)
  );

drop policy if exists "memberships manager decide" on site_memberships;
create policy "memberships manager decide" on site_memberships for update
  using (
    is_super_admin()
    or is_full_site_manager(site_id)
    or is_company_manager_for(site_id, company_id)
  );

-- The old is_manager_on_site function is no longer used by these two
-- policies, but may still be referenced elsewhere — left in place rather
-- than dropped, to avoid breaking anything unexpectedly.
