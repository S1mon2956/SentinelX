-- asset_types was left with Row Level Security OFF — found via:
--   SELECT schemaname, tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;
--
-- Turning RLS on with no policy attached would make the table fully
-- inaccessible (including to this app), not just "more secure" — so this
-- file enables it and attaches matching policies in the same migration.
--
-- asset_types has no site_id/company_id at all (just name, category,
-- requires_thorough_exam) — it's a shared lookup table, the same category
-- as sites/companies, which are already deliberately world-readable to any
-- authenticated user (see phase1_rls_consolidated.sql). The app also lets
-- any authenticated user insert a new type inline from the "Add asset"
-- screen (assets/page.jsx handleAddType, no role check) — so insert needs
-- to stay open too, or that feature breaks. Nothing in the app updates or
-- deletes asset_types, so no policy is added for those; they'll be denied
-- by default, which is fine since nothing needs them today.
--
-- Run in the Supabase SQL Editor.

alter table asset_types enable row level security;

drop policy if exists "asset_types read" on asset_types;
create policy "asset_types read" on asset_types for select
  using (auth.uid() is not null);

drop policy if exists "asset_types insert" on asset_types;
create policy "asset_types insert" on asset_types for insert
  with check (auth.uid() is not null);
