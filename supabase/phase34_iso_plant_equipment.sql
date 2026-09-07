-- Phase 34: ISO Excellence — Plant & Equipment
--
-- Round 2, section 1 of the screenshot-inspired feature expansion (Plant &
-- Equipment; Chemical Register/Learn/Reports/Hazards/Meetings remain
-- deferred). A per-client equipment register, conceptually similar to
-- SentinelX's own `assets` table but staying fully separate, matching the
-- standing decision that ISO Excellence never reuses SentinelX's core
-- data model.
--
-- Text-only for v1 — no certificate file upload (unlike SentinelX's
-- assets.thorough_exam_cert_path); just service-date fields. Unlike
-- iso_contractors/iso_risks, equipment IS taggable against clauses, via a
-- join table shaped exactly like iso_document_clauses (phase32).
--
-- Still internal-only: no client login exists, gated to super_admin same
-- as every ISO table so far.

create table iso_equipment (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  name text not null,
  asset_tag text,
  category text,
  location text,
  status text not null default 'in_service'
    check (status in ('in_service', 'out_of_service', 'decommissioned')),
  last_service_date date,
  next_service_date date,
  owner text,
  created_at timestamptz default now()
);

create table iso_equipment_clauses (
  id uuid primary key default uuid_generate_v4(),
  iso_equipment_id uuid not null references iso_equipment(id) on delete cascade,
  clause_id uuid not null references iso_clauses(id) on delete cascade,
  created_at timestamptz default now(),
  unique (iso_equipment_id, clause_id)
);

alter table iso_equipment enable row level security;
alter table iso_equipment_clauses enable row level security;

create policy "Super admin manages iso equipment" on iso_equipment
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso equipment clauses" on iso_equipment_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
