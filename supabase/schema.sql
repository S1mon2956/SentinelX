-- ISO Excellence / Sentinel Safety Services — Phase 1 schema
-- Target: Supabase (Postgres). Run in the Supabase SQL editor, top to bottom.
-- Row Level Security (RLS) is enabled on every tenant-scoped table — this is
-- what enforces multi-tenant isolation at the database level, not just in app code.

create extension if not exists "uuid-ossp";

-- ============================================================
-- CORE HIERARCHY: Organization -> Client -> Site -> Company -> User
-- ============================================================

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  logo_url text,
  watermark_enabled boolean default true, -- client can pay to disable
  created_at timestamptz default now()
);

create table clients (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  archived_at timestamptz -- archive, not hard delete, for compliance records
);

create table sites (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  address text,
  parent_site_id uuid references sites(id), -- supports site hierarchy / sub-sites
  created_at timestamptz default now(),
  archived_at timestamptz
);

-- A company working on a site: the client's own staff, or a contractor.
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_internal boolean default false, -- true = the client's own org, not a contractor
  created_at timestamptz default now()
);

-- Which companies are active on which sites
create table site_companies (
  site_id uuid references sites(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  primary key (site_id, company_id)
);

-- ============================================================
-- USERS & ROLE-PER-SITE
-- Role is NOT a single flag on the user — it's scoped per site,
-- because the same person can be a manager on one site and a
-- plain user on another (contractor manager example).
-- ============================================================

create type app_role as enum ('super_admin', 'site_manager', 'company_manager', 'user');
create type approval_status as enum ('pending', 'approved', 'rejected');

create table users (
  id uuid primary key references auth.users(id) on delete cascade, -- ties to Supabase auth
  email text unique not null,
  full_name text,
  phone text, -- for SMS notifications later
  is_super_admin boolean default false,
  created_at timestamptz default now()
);

-- One row per person, per site, per company they're registered to
create table site_memberships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role app_role not null default 'user',
  status approval_status not null default 'pending',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, site_id, company_id)
);

-- ============================================================
-- TEMPLATES (versioned — inspections snapshot the version they used)
-- ============================================================

create type answer_type as enum ('pass_fail_na', 'rating', 'multiple_choice', 'free_text');
create type failure_workflow as enum ('none', 'assign_action', 'requires_signoff');

create table templates (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  category text,
  branding_override_logo_url text,
  current_version int not null default 1,
  created_at timestamptz default now(),
  archived_at timestamptz
);

-- Every edit creates a new version row. Inspections reference a specific
-- version, so editing a template never rewrites history.
create table template_versions (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references templates(id) on delete cascade,
  version int not null,
  snapshot jsonb not null, -- full template + items at time of publishing
  created_at timestamptz default now(),
  unique (template_id, version)
);

create table template_items (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references templates(id) on delete cascade,
  question text not null,
  answer_type answer_type not null default 'pass_fail_na',
  category_tag text, -- e.g. "PPE", "fire safety" — enables cross-template trend rollups
  weight numeric default 1, -- severity weighting; editable, AI-suggested later
  failure_workflow failure_workflow not null default 'none',
  sort_order int default 0,
  options jsonb -- choices for answer_type = 'multiple_choice': [{"label": "...", "color": "..."}]
);

-- ============================================================
-- INSPECTIONS, ANSWERS, EVIDENCE, OBSERVATIONS
-- ============================================================

create type inspection_status as enum ('draft', 'submitted', 'reviewed', 'approved');

create table inspections (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references templates(id),
  template_version int not null, -- pins to the exact version used
  site_id uuid references sites(id),
  company_id uuid references companies(id),
  inspector_id uuid references users(id),
  status inspection_status not null default 'draft',
  score numeric, -- computed on submit, weighted
  created_at timestamptz default now(),
  submitted_at timestamptz
);

create table answers (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid references inspections(id) on delete cascade,
  template_item_id uuid references template_items(id),
  value text, -- 'pass' | 'fail' | 'na' | rating number | choice | free text
  notes text
);

create table evidence (
  id uuid primary key default uuid_generate_v4(),
  answer_id uuid references answers(id) on delete cascade,
  file_url text not null,
  captured_by uuid references users(id),
  captured_at timestamptz default now(),
  latitude numeric, -- optional GPS tagging
  longitude numeric,
  device_info text
);

create type observation_status as enum ('open', 'closed');

create table observations (
  id uuid primary key default uuid_generate_v4(),
  answer_id uuid references answers(id), -- null if raised standalone, not via inspection
  site_id uuid references sites(id),
  company_id uuid references companies(id), -- scopes visibility to this company + site managers
  status observation_status not null default 'open',
  assigned_to uuid references users(id),
  due_date date,
  closed_photo_url text,
  closed_description text,
  closed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- ASSETS (Vehicles / Tools & Equipment) + statutory inspection certs
-- ============================================================

create table asset_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null, -- e.g. "Mobile Elevated Work Platform", "Dumper Truck"
  category text not null check (category in ('vehicle', 'tools_equipment')),
  requires_thorough_exam boolean default false
);

create table assets (
  id uuid primary key default uuid_generate_v4(),
  asset_type_id uuid references asset_types(id),
  company_id uuid references companies(id),
  site_id uuid references sites(id),
  reference_number text not null, -- corresponds to the physical sticker
  serial_number text not null,
  power_output text,
  service_doc_url text,
  thorough_exam_cert_url text,
  thorough_exam_expiry date, -- drives the green/amber/red traffic light, computed in app
  created_at timestamptz default now(),
  archived_at timestamptz
);

create type transfer_status as enum ('pending', 'accepted', 'rejected');

create table asset_transfers (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid references assets(id) on delete cascade,
  from_site_id uuid references sites(id),
  to_site_id uuid references sites(id),
  new_reference_number text,
  requested_by uuid references users(id),
  status transfer_status not null default 'pending',
  reviewed_by uuid references users(id),
  reviewer_comment text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ============================================================
-- INCIDENT / NEAR-MISS REPORTING
-- ============================================================

create type incident_category as enum ('first_aid', 'lost_time', 'reportable', 'medical', 'near_miss');

create table incidents (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid references sites(id),
  company_id uuid references companies(id),
  reported_by uuid references users(id),
  category incident_category not null,
  description text,
  signature_url text, -- captured signature image
  latitude numeric,
  longitude numeric,
  created_at timestamptz default now()
);

-- ============================================================
-- AUDIT TRAIL — write on every meaningful change, from day one
-- ============================================================

create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  entity_table text not null,
  entity_id uuid not null,
  field text,
  old_value text,
  new_value text,
  changed_by uuid references users(id),
  changed_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — enable now, write real policies before go-live.
-- These are permissive placeholders so the app runs during development;
-- tighten to real site/company-scoped checks before any real client data
-- goes in. Do not skip this step.
-- ============================================================

alter table organizations enable row level security;
alter table clients enable row level security;
alter table sites enable row level security;
alter table companies enable row level security;
alter table site_companies enable row level security;
alter table site_memberships enable row level security;
alter table templates enable row level security;
alter table template_versions enable row level security;
alter table template_items enable row level security;
alter table inspections enable row level security;
alter table answers enable row level security;
alter table evidence enable row level security;
alter table observations enable row level security;
alter table assets enable row level security;
alter table asset_transfers enable row level security;
alter table incidents enable row level security;
alter table audit_log enable row level security;

-- TODO before go-live: replace with real policies, e.g.
-- create policy "site-scoped read" on observations for select
--   using (site_id in (select site_id from site_memberships where user_id = auth.uid() and status = 'approved'));
