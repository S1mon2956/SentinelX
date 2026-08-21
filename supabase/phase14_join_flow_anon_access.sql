-- Phase 14: anonymous read access needed for the unauthenticated /join flow

create view public.site_public_info as
  select id, name from sites where archived_at is null;

grant select on public.site_public_info to anon, authenticated;

create policy "Anyone can view companies" on companies
  for select using (true);

create policy "Anyone can view trade requirements" on trade_qualification_requirements
  for select using (true);
