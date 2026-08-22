-- Phase 24: scope the public /join/{siteId} flow's company list to only
-- the companies actually linked to that site, instead of exposing every
-- company across every client to any unauthenticated visitor.
--
-- companies already has an open anon-read policy (phase14), but the join
-- table needed to scope it to a single site — site_companies — has no
-- anon-read policy at all. Filtering the app query alone, without this,
-- would silently break the company dropdown for anyone not yet
-- authenticated (the query would just return nothing).

create policy "Anyone can view site-company links for active sites" on site_companies
  for select using (
    exists (select 1 from sites where sites.id = site_companies.site_id and sites.archived_at is null)
  );
