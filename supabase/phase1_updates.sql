-- Phase 1 follow-up: run this once in the Supabase SQL editor.

-- ============================================================
-- 1. Standalone observations (raised without an inspection answer)
--    need somewhere to store their own description/photo — the
--    existing closed_description / closed_photo_url columns only
--    make sense at close-out time.
-- ============================================================

alter table observations add column if not exists description text;
alter table observations add column if not exists photo_url text;

-- ============================================================
-- 2. RLS policies. schema.sql enables Row Level Security on every
--    table but ships with zero real policies — with RLS on and no
--    policy, every read/write is denied by default. These are
--    permissive placeholders (any authenticated user can read/write)
--    so the app functions during development. Replace with real
--    site/company-scoped policies before real client data goes in,
--    per the note at the bottom of schema.sql.
-- ============================================================

create policy "authenticated read templates" on templates
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert templates" on templates
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update templates" on templates
  for update using (auth.role() = 'authenticated');

create policy "authenticated read template_items" on template_items
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert template_items" on template_items
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated read template_versions" on template_versions
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert template_versions" on template_versions
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated read observations" on observations
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert observations" on observations
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update observations" on observations
  for update using (auth.role() = 'authenticated');
