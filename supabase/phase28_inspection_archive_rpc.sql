-- Phase 28: scope inspection archive/unarchive to managers + super admin
--
-- The "inspections update" policy (phase22) is intentionally broad —
-- any approved site user can update any inspection field, which was
-- true before phase27 too. archived_at introduces a new action
-- (archive/unarchive) that the UI restricts to managers, but nothing
-- enforced that at the DB layer. This RPC closes that gap without
-- touching the general update policy, which other flows may depend on.

create or replace function toggle_inspection_archive(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_company_id uuid;
  v_archived timestamptz;
begin
  select site_id, company_id, archived_at
    into v_site_id, v_company_id, v_archived
    from inspections
   where id = p_inspection_id;

  if not found then
    return;
  end if;

  if not (
    is_super_admin()
    or is_full_site_manager(v_site_id)
    or is_company_manager_for(v_site_id, v_company_id)
  ) then
    return;
  end if;

  update inspections
     set archived_at = case when v_archived is null then now() else null end
   where id = p_inspection_id;
end;
$$;

revoke all on function toggle_inspection_archive(uuid) from public;
grant execute on function toggle_inspection_archive(uuid) to authenticated;
