-- Phase 13: Trade qualification schemes + site induction process
-- Adds admin-configurable qualification card rules, per-site induction
-- content (video + declarations), and induction submissions. Kept
-- entirely separate from site_memberships and its existing RLS/approval
-- logic — nothing about the current registration flow changes.

-- ── Reference data: qualification schemes and card types ──────────────────

create table qualification_schemes (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique, -- e.g. 'CSCS', 'CPCS', 'IPAF', 'PASMA'
  created_at timestamptz default now()
);

create table qualification_card_types (
  id uuid primary key default uuid_generate_v4(),
  scheme_id uuid references qualification_schemes(id) on delete cascade,
  label text not null, -- e.g. 'Red - Apprentice/Trainee', 'Gold - Supervisor'
  level_rank int not null default 0,
  created_at timestamptz default now()
);

create type experience_level as enum ('apprentice', 'skilled', 'supervisor', 'manager');

-- Global rule set for now (per your decision) — one set of requirements
-- applies to every site. Add a nullable site_id override column later
-- if a specific site ever needs its own rules.
create table trade_qualification_requirements (
  id uuid primary key default uuid_generate_v4(),
  trade text not null,
  experience_level experience_level not null,
  required_card_type_id uuid references qualification_card_types(id) on delete cascade,
  created_at timestamptz default now(),
  unique (trade, experience_level)
);

-- ── Per-site induction content ─────────────────────────────────────────────

create table site_inductions (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid references sites(id) on delete cascade unique,
  video_url text,
  created_at timestamptz default now()
);

create table site_induction_declarations (
  id uuid primary key default uuid_generate_v4(),
  site_id uuid references sites(id) on delete cascade,
  role_type text not null, -- e.g. 'employee', 'supervisor', 'plant_operator'
  declaration_text text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ── A person's induction submission, one per site_memberships row ─────────

create type induction_review_status as enum ('pending', 'approved', 'rejected', 'needs_more_info');

create table site_membership_inductions (
  id uuid primary key default uuid_generate_v4(),
  site_membership_id uuid references site_memberships(id) on delete cascade unique,
  trade text,
  experience_level experience_level,
  role_type text,
  declarations_accepted boolean default false,
  video_watched_at timestamptz,
  status induction_review_status not null default 'pending',
  reviewed_by uuid references users(id),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table qualification_uploads (
  id uuid primary key default uuid_generate_v4(),
  site_membership_induction_id uuid references site_membership_inductions(id) on delete cascade,
  file_url text not null,
  card_type_id uuid references qualification_card_types(id),
  ai_extracted_scheme text,
  ai_extracted_card_type text,
  ai_extracted_trade text,
  ai_extracted_expiry date,
  ai_flag text, -- e.g. 'expired', 'trade_mismatch', 'ok', 'unclear' — suggestion only, never authoritative
  uploaded_at timestamptz default now()
);

-- ── Helper functions (SECURITY DEFINER, explicit search_path — matches
--    the pattern already used by is_approved_on_site etc., and avoids the
--    search_path warning flagged by Advisors on other functions) ─────────

create or replace function public.owns_site_membership(check_site_membership_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships
    where id = check_site_membership_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_manager_of_site_membership(check_site_membership_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from site_memberships sm
    where sm.id = check_site_membership_id
      and (
        public.is_super_admin()
        or public.is_manager_on_site(sm.site_id)
        or public.is_company_manager_for(sm.site_id, sm.company_id)
      )
  );
$$;

create or replace function public.owns_site_membership_induction(check_induction_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from site_membership_inductions smi
    join site_memberships sm on sm.id = smi.site_membership_id
    where smi.id = check_induction_id
      and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_manager_of_site_membership_induction(check_induction_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from site_membership_inductions smi
    join site_memberships sm on sm.id = smi.site_membership_id
    where smi.id = check_induction_id
      and (
        public.is_super_admin()
        or public.is_manager_on_site(sm.site_id)
        or public.is_company_manager_for(sm.site_id, sm.company_id)
      )
  );
$$;

-- ── Row Level Security — every table enabled and policied here ────────────

alter table qualification_schemes enable row level security;
alter table qualification_card_types enable row level security;
alter table trade_qualification_requirements enable row level security;
alter table site_inductions enable row level security;
alter table site_induction_declarations enable row level security;
alter table site_membership_inductions enable row level security;
alter table qualification_uploads enable row level security;

-- Reference/config tables: readable by any authenticated user, writable
-- only by super admin — same pattern as asset_types.
create policy "Authenticated can view qualification schemes" on qualification_schemes
  for select using (auth.role() = 'authenticated');
create policy "Super admin manages qualification schemes" on qualification_schemes
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Authenticated can view qualification card types" on qualification_card_types
  for select using (auth.role() = 'authenticated');
create policy "Super admin manages qualification card types" on qualification_card_types
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Authenticated can view trade requirements" on trade_qualification_requirements
  for select using (auth.role() = 'authenticated');
create policy "Super admin manages trade requirements" on trade_qualification_requirements
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Induction content: readable by anyone, including someone not yet
-- registered — they need to see it before they can request access.
-- Writable only by that site's manager or super admin.
create policy "Anyone can view site inductions" on site_inductions
  for select using (true);
create policy "Site managers manage site inductions" on site_inductions
  for all using (public.is_super_admin() or public.is_manager_on_site(site_id))
  with check (public.is_super_admin() or public.is_manager_on_site(site_id));

create policy "Anyone can view site induction declarations" on site_induction_declarations
  for select using (true);
create policy "Site managers manage site induction declarations" on site_induction_declarations
  for all using (public.is_super_admin() or public.is_manager_on_site(site_id))
  with check (public.is_super_admin() or public.is_manager_on_site(site_id));

-- A person's own induction submission: they can insert/view/update it;
-- managers on that site (or super admin) can view and update (to
-- approve/reject/request more info).
create policy "Users manage their own induction submission" on site_membership_inductions
  for all using (
    public.owns_site_membership(site_membership_id)
    or public.is_manager_of_site_membership(site_membership_id)
  )
  with check (
    public.owns_site_membership(site_membership_id)
    or public.is_manager_of_site_membership(site_membership_id)
  );

create policy "Users manage their own qualification uploads" on qualification_uploads
  for all using (
    public.owns_site_membership_induction(site_membership_induction_id)
    or public.is_manager_of_site_membership_induction(site_membership_induction_id)
  )
  with check (
    public.owns_site_membership_induction(site_membership_induction_id)
    or public.is_manager_of_site_membership_induction(site_membership_induction_id)
  );
