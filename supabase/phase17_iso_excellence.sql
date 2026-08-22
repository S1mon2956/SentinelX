-- Phase 17: ISO Excellence — document register foundation (45001 first)
-- v1 is an internal tool: no client login, everything gated to super admin.
-- Deliberately separate from `clients` — an ISO Excellence client may have
-- no relationship to the inspection/safety side of the platform at all.

create table iso_organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  standard text not null default '45001',
  created_at timestamptz default now()
);

create table iso_document_templates (
  id uuid primary key default uuid_generate_v4(),
  standard text not null default '45001',
  clause_reference text,
  title text not null,
  document_type text not null default 'policy', -- policy | procedure | form | record
  template_content text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table iso_documents (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid references iso_organizations(id) on delete cascade,
  template_id uuid references iso_document_templates(id),
  clause_reference text,
  title text not null,
  document_type text not null default 'policy',
  status text not null default 'draft', -- draft | in_review | approved | superseded
  created_at timestamptz default now()
);

create table iso_document_versions (
  id uuid primary key default uuid_generate_v4(),
  iso_document_id uuid references iso_documents(id) on delete cascade,
  version_number int not null,
  content text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

alter table iso_organizations enable row level security;
alter table iso_document_templates enable row level security;
alter table iso_documents enable row level security;
alter table iso_document_versions enable row level security;

create policy "Super admin manages iso organizations" on iso_organizations
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso document templates" on iso_document_templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso documents" on iso_documents
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso document versions" on iso_document_versions
  for all using (public.is_super_admin()) with check (public.is_super_admin());
