-- Phase 25: controlled vocabulary for item categories, so dashboard/
-- risk-heatmap aggregation stops fragmenting on typos ("housekeepinhg"
-- vs "Houskeeeping") or falling back to raw question text when
-- category_tag was never set.
--
-- Lookup-table pattern (not a hard enum) to match the existing
-- asset_types/qualification_card_types precedent — this list is
-- something a super admin may want to extend later without a schema
-- migration, unlike answer_type which is genuinely fixed. Template
-- authors keep writing the actual question as free text; only the
-- category tag becomes a controlled pick.

create table issue_categories (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  sort_order int not null default 0
);

alter table issue_categories enable row level security;

-- Same shape as qualification_card_types (phase13): readable by any
-- authenticated user, writable only by super admin — this is a curated
-- list, not something template authors add to inline.
create policy "Authenticated can view issue categories" on issue_categories
  for select using (auth.role() = 'authenticated');
create policy "Super admin manages issue categories" on issue_categories
  for all using (is_super_admin()) with check (is_super_admin());

insert into issue_categories (label, sort_order) values
  ('PPE', 10),
  ('Fire Safety', 20),
  ('Housekeeping', 30),
  ('Working at Height', 40),
  ('Electrical Safety', 50),
  ('Manual Handling', 60),
  ('Slips, Trips & Falls', 70),
  ('Machinery & Equipment', 80),
  ('Statutory / LOLER', 90),
  ('Environmental', 100),
  ('Other', 999);

alter table template_items add column category_id uuid references issue_categories(id);

-- Backfill: exact, case/whitespace-insensitive match against the seed
-- list only — deliberately not fuzzy. Anything that doesn't hit an exact
-- match stays NULL (falls into "Uncategorized" in the app). This is test
-- data; the backfill's job is to prove the mechanism works, not preserve
-- every historical typo's intent — a fuzzy backfill would just
-- reintroduce, once, the exact class of error this migration exists to
-- stop happening continuously.
update template_items ti
set category_id = ic.id
from issue_categories ic
where ti.category_tag is not null
  and lower(trim(ti.category_tag)) = lower(trim(ic.label));

-- category_tag is left in place, not dropped. Nothing in the app will
-- read it once the diffs land, but dropping a column is irreversible and
-- out of scope here — safe to drop in a later cleanup once category_id
-- has been live for a while.
