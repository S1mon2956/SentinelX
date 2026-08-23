-- Phase 27: archive support for inspections
--
-- Every other long-lived record (sites, clients, templates, assets) already
-- has archived_at; inspections didn't. No new RLS policy is needed — the
-- existing "inspections update" policy from phase22 (is_super_admin() or
-- is_approved_on_site(site_id)) already covers setting this column.

alter table inspections add column archived_at timestamptz;
