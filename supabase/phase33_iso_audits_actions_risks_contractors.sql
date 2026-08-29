-- Phase 33: ISO Excellence — Audits/Checklists, Actions, Risk register, Contractors
--
-- Round 1 of the screenshot-inspired feature expansion (Actions,
-- Audits/Checklists, Risk register, Contractors — the remaining sections
-- from the reference screenshot are deferred). Stays fully separate from
-- SentinelX's own data model, matching phase17's original design note:
-- an ISO Excellence client may have no relationship to the
-- inspection/safety side of the platform at all.
--
-- Still internal-only: no client login exists, everything gated to
-- super_admin, same as every ISO table so far.

-- ── Checklists: reusable template + per-client audit runs ─────────────────
-- Same relationship as iso_document_templates -> iso_documents.

create table iso_checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table iso_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  checklist_template_id uuid not null references iso_checklist_templates(id) on delete cascade,
  question text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table iso_checklist_template_clauses (
  id uuid primary key default uuid_generate_v4(),
  checklist_template_id uuid not null references iso_checklist_templates(id) on delete cascade,
  clause_id uuid not null references iso_clauses(id) on delete cascade,
  created_at timestamptz default now(),
  unique (checklist_template_id, clause_id)
);

create table iso_audits (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  checklist_template_id uuid references iso_checklist_templates(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed')),
  auditor_id uuid references users(id),
  conducted_at date,
  created_at timestamptz default now()
);

-- question is snapshotted as text at creation time — same reasoning as
-- SentinelX's template_versions: editing the checklist template later
-- must never rewrite the record of what was actually asked in a past audit.
create table iso_audit_answers (
  id uuid primary key default uuid_generate_v4(),
  iso_audit_id uuid not null references iso_audits(id) on delete cascade,
  checklist_item_id uuid references iso_checklist_items(id) on delete set null,
  question text not null,
  result text not null default 'pending'
    check (result in ('pending', 'pass', 'fail', 'na')),
  notes text,
  created_at timestamptz default now()
);

-- ── Actions ─────────────────────────────────────────────────────────────

create table iso_actions (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  title text not null,
  description text,
  source_audit_id uuid references iso_audits(id) on delete set null,
  source_audit_answer_id uuid references iso_audit_answers(id) on delete set null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed')),
  owner text, -- free text for v1 — no contractor/user picker yet
  due_date date,
  created_at timestamptz default now(),
  closed_at timestamptz
);

-- ── Risk register ───────────────────────────────────────────────────────

create table iso_risks (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  title text not null,
  description text,
  category text,
  likelihood int not null default 1 check (likelihood between 1 and 5),
  impact int not null default 1 check (impact between 1 and 5),
  risk_score int generated always as (likelihood * impact) stored,
  status text not null default 'open'
    check (status in ('open', 'mitigated', 'closed')),
  owner text,
  review_date date,
  created_at timestamptz default now()
);

-- ── Contractors ─────────────────────────────────────────────────────────

create table iso_contractors (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  services_provided text,
  status text not null default 'approved'
    check (status in ('approved', 'pending', 'suspended')),
  created_at timestamptz default now()
);

-- ── RLS — same super_admin-only pattern as every existing ISO table ───────

alter table iso_checklist_templates enable row level security;
alter table iso_checklist_items enable row level security;
alter table iso_checklist_template_clauses enable row level security;
alter table iso_audits enable row level security;
alter table iso_audit_answers enable row level security;
alter table iso_actions enable row level security;
alter table iso_risks enable row level security;
alter table iso_contractors enable row level security;

create policy "Super admin manages iso checklist templates" on iso_checklist_templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso checklist items" on iso_checklist_items
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso checklist template clauses" on iso_checklist_template_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso audits" on iso_audits
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso audit answers" on iso_audit_answers
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso actions" on iso_actions
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso risks" on iso_risks
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso contractors" on iso_contractors
  for all using (public.is_super_admin()) with check (public.is_super_admin());
