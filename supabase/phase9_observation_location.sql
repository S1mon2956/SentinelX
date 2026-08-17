-- evidence and incidents already have latitude/longitude columns from the
-- original schema. observations doesn't (closed_photo_url is a plain text
-- field, not a full evidence record) — adding matching columns here so
-- close-out photos can carry location too, for consistency.

alter table observations add column if not exists closed_latitude numeric;
alter table observations add column if not exists closed_longitude numeric;
