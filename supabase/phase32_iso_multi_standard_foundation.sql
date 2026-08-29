-- Phase 32: ISO Excellence — multi-standard + IMS foundation
--
-- Replaces the free-text `standard` column (phase17) with proper
-- normalized standards/clauses, and moves from "one standard per
-- organization" to a many-to-many model supporting Integrated
-- Management Systems (one client enrolled across multiple standards
-- at once, with documents/templates satisfying multiple clauses
-- across multiple standards simultaneously).
--
-- Still internal-only: no client login exists, everything gated to
-- super_admin, same as phase17. RLS design deliberately deferred on
-- client-facing access until that becomes real.
--
-- Existing test data (ACME Roofing's '45001' string) is not migrated —
-- confirmed with Simon as acceptable given only one test client exists;
-- standard/clause links will be reassigned manually via the new UI.

-- 1. Standards — versioned, not just a code
create table iso_standards (
  id uuid primary key default uuid_generate_v4(),
  code text not null,              -- e.g. '45001'
  name text not null,              -- e.g. 'ISO 45001:2018 — Occupational Health & Safety'
  edition text,                    -- e.g. '2018', nullable
  created_at timestamptz default now(),
  unique (code, edition)
);

-- 2. Clauses — first-class, belong to exactly one standard
create table iso_clauses (
  id uuid primary key default uuid_generate_v4(),
  standard_id uuid not null references iso_standards(id) on delete cascade,
  clause_reference text not null,  -- e.g. '6.1.2'
  title text not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique (standard_id, clause_reference)
);

-- 3. Organizations — drop old free-text standard column
alter table iso_organizations drop column if exists standard;

-- 4. Client <-> Standards (many-to-many — IMS support)
create table iso_organization_standards (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  standard_id uuid not null references iso_standards(id) on delete cascade,
  created_at timestamptz default now(),
  unique (iso_organization_id, standard_id)
);

-- 5. Client <-> Clauses (per-standard toggle — which clauses are
-- actually in scope for this client)
create table iso_organization_clauses (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  clause_id uuid not null references iso_clauses(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (iso_organization_id, clause_id)
);

-- 6. Documents — drop single clause_reference string, keep document_type
alter table iso_documents drop column if exists clause_reference;

-- 7. Document <-> Clauses (many-to-many)
create table iso_document_clauses (
  id uuid primary key default uuid_generate_v4(),
  iso_document_id uuid not null references iso_documents(id) on delete cascade,
  clause_id uuid not null references iso_clauses(id) on delete cascade,
  created_at timestamptz default now(),
  unique (iso_document_id, clause_id)
);

-- 8. Templates — same multi-clause treatment
alter table iso_document_templates drop column if exists standard;
alter table iso_document_templates drop column if exists clause_reference;

create table iso_template_clauses (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references iso_document_templates(id) on delete cascade,
  clause_id uuid not null references iso_clauses(id) on delete cascade,
  created_at timestamptz default now(),
  unique (template_id, clause_id)
);

-- RLS — same super_admin-only pattern as every existing ISO table
alter table iso_standards enable row level security;
alter table iso_clauses enable row level security;
alter table iso_organization_standards enable row level security;
alter table iso_organization_clauses enable row level security;
alter table iso_document_clauses enable row level security;
alter table iso_template_clauses enable row level security;

create policy "Super admin manages iso standards" on iso_standards
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso clauses" on iso_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso organization standards" on iso_organization_standards
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso organization clauses" on iso_organization_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso document clauses" on iso_document_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso template clauses" on iso_template_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
