-- Phase 16: standardised declaration library + induction signature

create table declaration_templates (
  id uuid primary key default uuid_generate_v4(),
  role_type text not null,
  declaration_text text not null,
  created_at timestamptz default now()
);

alter table declaration_templates enable row level security;

create policy "Anyone can view declaration templates" on declaration_templates
  for select using (true);
create policy "Super admin manages declaration templates" on declaration_templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Sites now attach declarations from the standard library instead of
-- writing their own wording. This is still pre-launch test data, so
-- dropping the old free-text columns is safe.
alter table site_induction_declarations add column declaration_template_id uuid references declaration_templates(id) on delete cascade;
alter table site_induction_declarations drop column declaration_text;
alter table site_induction_declarations drop column role_type;

-- Signature captured at submission, covering all attached declarations.
alter table site_membership_inductions add column signature_url text;
alter table site_membership_inductions add column signed_at timestamptz;
