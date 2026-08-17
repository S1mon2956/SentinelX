-- Asset transfer support. Run this in the Supabase SQL Editor.
--
-- Design note: a transfer's approver works at the DESTINATION site, but the
-- asset itself still technically belongs to the ORIGIN site until the
-- transfer is accepted. The original asset_transfers RLS policy (based on
-- the asset's current site) would have blocked destination-site managers
-- from ever seeing or approving a request — fixed here by checking against
-- the transfer's own from_site_id/to_site_id instead.
--
-- Moving the asset itself (updating its site_id) has the same problem: a
-- destination manager updating a row that currently belongs to a site they
-- aren't part of would get blocked by the assets table's own RLS. Rather
-- than loosen that (which would weaken real tenant isolation), the actual
-- site change happens inside a security-definer function below, which
-- checks permission explicitly rather than relying on row-level policy.

-- ============================================================
-- Fix asset_transfers RLS to check both ends of the transfer
-- ============================================================

drop policy if exists "asset_transfers read" on asset_transfers;
create policy "asset_transfers read" on asset_transfers for select
  using (is_super_admin() or is_approved_on_site(from_site_id) or is_approved_on_site(to_site_id));

drop policy if exists "asset_transfers write" on asset_transfers;
drop policy if exists "asset_transfers insert" on asset_transfers;
create policy "asset_transfers insert" on asset_transfers for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and (is_super_admin() or is_approved_on_site(from_site_id))
  );

-- No general update policy for regular users — decisions go through the
-- function below instead, so permission is checked explicitly rather than
-- relying on row ownership at the moment the check runs.

-- ============================================================
-- Approve or reject a transfer. Runs as security definer so it can move
-- the asset's site_id even though the caller may not have direct RLS
-- write access to the asset's current (origin) site row.
-- ============================================================

create or replace function public.decide_asset_transfer(
  transfer_id uuid,
  decision text, -- 'accepted' or 'rejected'
  comment text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  t asset_transfers%rowtype;
begin
  select * into t from asset_transfers where id = transfer_id;

  if t.id is null then
    raise exception 'Transfer not found';
  end if;

  if t.status != 'pending' then
    raise exception 'Transfer already resolved';
  end if;

  if decision not in ('accepted', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  -- Only someone approved on the DESTINATION site (or a super admin) can decide.
  if not (public.is_super_admin() or public.is_approved_on_site(t.to_site_id)) then
    raise exception 'Not authorized to decide this transfer';
  end if;

  update asset_transfers
  set status = decision::transfer_status,
      reviewed_by = auth.uid(),
      reviewer_comment = comment,
      resolved_at = now()
  where id = transfer_id;

  if decision = 'accepted' then
    update assets
    set site_id = t.to_site_id,
        reference_number = coalesce(t.new_reference_number, reference_number)
    where id = t.asset_id;
  end if;
end;
$$;

-- Let any authenticated user call it — the real permission check happens
-- inside the function itself, above.
grant execute on function public.decide_asset_transfer(uuid, text, text) to authenticated;
