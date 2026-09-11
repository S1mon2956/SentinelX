-- Phase 36: ISO Excellence — Meetings & Audit Reports
--
-- Round 2, sections 2-3. Meetings is a simple flat per-client log (no clause
-- tagging), matching the iso_contractors/iso_risks convention. Audit Reports
-- is ISO Excellence's first file-upload feature — gets its own dedicated
-- private storage bucket (iso-audit-reports) rather than reusing SentinelX's
-- evidence/personal-documents buckets, preserving the standing decision that
-- ISO Excellence never shares SentinelX's core data model.
--
-- Still internal-only: no client login exists, gated to super_admin same as
-- every ISO table so far. The storage policy is a single blanket
-- is_super_admin() check — simpler than SentinelX's evidence-bucket policies
-- (which need per-role/per-ownership logic for multiple non-admin roles)
-- because ISO Excellence is entirely super-admin-gated.

create table iso_meetings (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  title text not null,
  meeting_date date not null,
  attendees text,
  minutes text,
  created_at timestamptz default now()
);

create table iso_audit_reports (
  id uuid primary key default uuid_generate_v4(),
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  title text not null,
  report_type text not null default 'internal'
    check (report_type in ('internal', 'external')),
  report_date date,
  file_path text not null,
  notes text,
  uploaded_by uuid references users(id),
  created_at timestamptz default now()
);

alter table iso_meetings enable row level security;
alter table iso_audit_reports enable row level security;

create policy "Super admin manages iso meetings" on iso_meetings
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin manages iso audit reports" on iso_audit_reports
  for all using (public.is_super_admin()) with check (public.is_super_admin());

insert into storage.buckets (id, name, public)
values ('iso-audit-reports', 'iso-audit-reports', false)
on conflict (id) do nothing;

create policy "Super admin manages iso audit report files" on storage.objects
  for all using (bucket_id = 'iso-audit-reports' and public.is_super_admin())
  with check (bucket_id = 'iso-audit-reports' and public.is_super_admin());
