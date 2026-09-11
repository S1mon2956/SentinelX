-- Phase 37: ISO Excellence — client-facing membership & scoped access
--
-- Moves ISO Excellence from super-admin-only to client-facing, using the
-- same design principle as SentinelX's site_memberships/is_approved_on_site
-- pattern, adapted for ISO's needs:
--
--   - `member`: full read/write on their own org, across every section.
--   - `restricted`: access only to explicitly granted sections (e.g. an
--     external auditor granted only 'audits' + 'reports'), via
--     iso_membership_scopes. Chosen over a role-per-access-pattern model
--     (Option A) because Simon anticipates multiple distinct restricted
--     patterns over time, not just the one auditor case.
--   - super_admin bypasses everything, unchanged, no membership row needed.
--
-- No self-registration: Simon creates the org, standard enrollment, and
-- membership rows directly (matches confirmed workflow — clients approach
-- ISO Excellence, are paid-enrolled in specific standards manually).
--
-- Clause/standard enrollment (the "Standards & clause scope" panel) stays
-- member-or-super-admin only even for a 'documents'-scoped restricted
-- user — that's structural configuration, not day-to-day document work.
--
-- Global reference/library tables (standards, clauses, document templates,
-- checklist templates + their clause-tag join tables) become read-only for
-- ANY approved membership (member or restricted, any section) — no
-- sensitivity in this content, restricted users still need context.

-- ── Membership & scopes ────────────────────────────────────────────────

create table iso_organization_memberships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  iso_organization_id uuid not null references iso_organizations(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'restricted')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, iso_organization_id)
);

create table iso_membership_scopes (
  id uuid primary key default uuid_generate_v4(),
  membership_id uuid not null references iso_organization_memberships(id) on delete cascade,
  section text not null check (section in (
    'documents', 'audits', 'actions', 'risks', 'contractors',
    'equipment', 'meetings', 'reports'
  )),
  created_at timestamptz default now(),
  unique (membership_id, section)
);

alter table iso_organization_memberships enable row level security;
alter table iso_membership_scopes enable row level security;

-- Membership/scope management stays super-admin only for now — Simon
-- creates all client access manually per the confirmed workflow. A member
-- can read their OWN membership row (so the app can check their own
-- role/status client-side), but cannot self-modify it.
create policy "Super admin manages iso memberships" on iso_organization_memberships
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Members read own membership" on iso_organization_memberships
  for select using (user_id = auth.uid());

create policy "Super admin manages iso membership scopes" on iso_membership_scopes
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Members read own scopes" on iso_membership_scopes
  for select using (
    exists (select 1 from iso_organization_memberships m where m.id = membership_id and m.user_id = auth.uid())
  );

-- ── Helper functions ──────────────────────────────────────────────────────

create or replace function public.has_iso_access(check_org_id uuid, check_section text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from iso_organization_memberships m
    where m.iso_organization_id = check_org_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and (
        m.role = 'member'
        or exists (
          select 1 from iso_membership_scopes s
          where s.membership_id = m.id and s.section = check_section
        )
      )
  );
$$;

-- Structural/config access (standards enrollment, clause activation) —
-- member-only, no restricted-role path regardless of section grants.
create or replace function public.has_iso_member_access(check_org_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from iso_organization_memberships m
    where m.iso_organization_id = check_org_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and m.role = 'member'
  );
$$;

-- Any approved membership at all, any role/section — for global
-- reference/library read access.
create or replace function public.has_any_iso_access()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from iso_organization_memberships m
    where m.user_id = auth.uid() and m.status = 'approved'
  );
$$;

-- ── iso_organizations: client sees own org row only ──────────────────────

drop policy if exists "Super admin manages iso organizations" on iso_organizations;
create policy "Super admin manages iso organizations" on iso_organizations
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Members read own organization" on iso_organizations
  for select using (
    exists (
      select 1 from iso_organization_memberships m
      where m.iso_organization_id = id and m.user_id = auth.uid() and m.status = 'approved'
    )
  );

-- ── Structural/config tables: member-only (has_iso_member_access) ────────

drop policy if exists "Super admin manages iso organization standards" on iso_organization_standards;
create policy "Super admin manages iso organization standards" on iso_organization_standards
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Members manage own organization standards" on iso_organization_standards
  for all
  using (public.has_iso_member_access(iso_organization_id))
  with check (public.has_iso_member_access(iso_organization_id));

drop policy if exists "Super admin manages iso organization clauses" on iso_organization_clauses;
create policy "Super admin manages iso organization clauses" on iso_organization_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Members manage own organization clauses" on iso_organization_clauses
  for all
  using (public.has_iso_member_access(iso_organization_id))
  with check (public.has_iso_member_access(iso_organization_id));

-- ── Section-scoped tables (has_iso_access, direct org_id) ────────────────

drop policy if exists "Super admin manages iso documents" on iso_documents;
create policy "Super admin manages iso documents" on iso_documents
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso documents" on iso_documents
  for all
  using (public.has_iso_access(iso_organization_id, 'documents'))
  with check (public.has_iso_access(iso_organization_id, 'documents'));

drop policy if exists "Super admin manages iso audits" on iso_audits;
create policy "Super admin manages iso audits" on iso_audits
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso audits" on iso_audits
  for all
  using (public.has_iso_access(iso_organization_id, 'audits'))
  with check (public.has_iso_access(iso_organization_id, 'audits'));

drop policy if exists "Super admin manages iso actions" on iso_actions;
create policy "Super admin manages iso actions" on iso_actions
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso actions" on iso_actions
  for all
  using (public.has_iso_access(iso_organization_id, 'actions'))
  with check (public.has_iso_access(iso_organization_id, 'actions'));

drop policy if exists "Super admin manages iso risks" on iso_risks;
create policy "Super admin manages iso risks" on iso_risks
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso risks" on iso_risks
  for all
  using (public.has_iso_access(iso_organization_id, 'risks'))
  with check (public.has_iso_access(iso_organization_id, 'risks'));

drop policy if exists "Super admin manages iso contractors" on iso_contractors;
create policy "Super admin manages iso contractors" on iso_contractors
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso contractors" on iso_contractors
  for all
  using (public.has_iso_access(iso_organization_id, 'contractors'))
  with check (public.has_iso_access(iso_organization_id, 'contractors'));

drop policy if exists "Super admin manages iso equipment" on iso_equipment;
create policy "Super admin manages iso equipment" on iso_equipment
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso equipment" on iso_equipment
  for all
  using (public.has_iso_access(iso_organization_id, 'equipment'))
  with check (public.has_iso_access(iso_organization_id, 'equipment'));

drop policy if exists "Super admin manages iso meetings" on iso_meetings;
create policy "Super admin manages iso meetings" on iso_meetings
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso meetings" on iso_meetings
  for all
  using (public.has_iso_access(iso_organization_id, 'meetings'))
  with check (public.has_iso_access(iso_organization_id, 'meetings'));

drop policy if exists "Super admin manages iso audit reports" on iso_audit_reports;
create policy "Super admin manages iso audit reports" on iso_audit_reports
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso audit reports" on iso_audit_reports
  for all
  using (public.has_iso_access(iso_organization_id, 'reports'))
  with check (public.has_iso_access(iso_organization_id, 'reports'));

-- ── One-join-away tables (inherit parent's section scope) ────────────────

drop policy if exists "Super admin manages iso document versions" on iso_document_versions;
create policy "Super admin manages iso document versions" on iso_document_versions
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso document versions" on iso_document_versions
  for all
  using (exists (
    select 1 from iso_documents d
    where d.id = iso_document_id and public.has_iso_access(d.iso_organization_id, 'documents')
  ))
  with check (exists (
    select 1 from iso_documents d
    where d.id = iso_document_id and public.has_iso_access(d.iso_organization_id, 'documents')
  ));

drop policy if exists "Super admin manages iso document clauses" on iso_document_clauses;
create policy "Super admin manages iso document clauses" on iso_document_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso document clauses" on iso_document_clauses
  for all
  using (exists (
    select 1 from iso_documents d
    where d.id = iso_document_id and public.has_iso_access(d.iso_organization_id, 'documents')
  ))
  with check (exists (
    select 1 from iso_documents d
    where d.id = iso_document_id and public.has_iso_access(d.iso_organization_id, 'documents')
  ));

drop policy if exists "Super admin manages iso audit answers" on iso_audit_answers;
create policy "Super admin manages iso audit answers" on iso_audit_answers
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso audit answers" on iso_audit_answers
  for all
  using (exists (
    select 1 from iso_audits a
    where a.id = iso_audit_id and public.has_iso_access(a.iso_organization_id, 'audits')
  ))
  with check (exists (
    select 1 from iso_audits a
    where a.id = iso_audit_id and public.has_iso_access(a.iso_organization_id, 'audits')
  ));

drop policy if exists "Super admin manages iso equipment clauses" on iso_equipment_clauses;
create policy "Super admin manages iso equipment clauses" on iso_equipment_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Scoped access to iso equipment clauses" on iso_equipment_clauses
  for all
  using (exists (
    select 1 from iso_equipment e
    where e.id = iso_equipment_id and public.has_iso_access(e.iso_organization_id, 'equipment')
  ))
  with check (exists (
    select 1 from iso_equipment e
    where e.id = iso_equipment_id and public.has_iso_access(e.iso_organization_id, 'equipment')
  ));

-- ── Global reference/library tables: any approved membership reads ───────

drop policy if exists "Super admin manages iso standards" on iso_standards;
create policy "Super admin manages iso standards" on iso_standards
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso standards" on iso_standards
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso clauses" on iso_clauses;
create policy "Super admin manages iso clauses" on iso_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso clauses" on iso_clauses
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso document templates" on iso_document_templates;
create policy "Super admin manages iso document templates" on iso_document_templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso document templates" on iso_document_templates
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso template clauses" on iso_template_clauses;
create policy "Super admin manages iso template clauses" on iso_template_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso template clauses" on iso_template_clauses
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso checklist templates" on iso_checklist_templates;
create policy "Super admin manages iso checklist templates" on iso_checklist_templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso checklist templates" on iso_checklist_templates
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso checklist items" on iso_checklist_items;
create policy "Super admin manages iso checklist items" on iso_checklist_items
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso checklist items" on iso_checklist_items
  for select using (public.has_any_iso_access());

drop policy if exists "Super admin manages iso checklist template clauses" on iso_checklist_template_clauses;
create policy "Super admin manages iso checklist template clauses" on iso_checklist_template_clauses
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Any approved member reads iso checklist template clauses" on iso_checklist_template_clauses
  for select using (public.has_any_iso_access());

-- ── Storage: iso-audit-reports bucket, section-scoped like the table ─────

drop policy if exists "Super admin manages iso audit report files" on storage.objects;
create policy "Super admin manages iso audit report files" on storage.objects
  for all using (bucket_id = 'iso-audit-reports' and public.is_super_admin())
  with check (bucket_id = 'iso-audit-reports' and public.is_super_admin());

-- File path convention (established in phase36): {org_id}/{uuid}/{filename}
-- — first path segment is the org id, used to check section access the
-- same way the personal-documents bucket derives owner/induction id from
-- the path (phase18).
create policy "Scoped access to iso audit report files" on storage.objects
  for all
  using (
    bucket_id = 'iso-audit-reports'
    and public.has_iso_access(((storage.foldername(name))[1])::uuid, 'reports')
  )
  with check (
    bucket_id = 'iso-audit-reports'
    and public.has_iso_access(((storage.foldername(name))[1])::uuid, 'reports')
  );
