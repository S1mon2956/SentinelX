-- Lets an inspector target a specific reviewer when submitting, instead of
-- notifying every site/company manager. Anyone with a qualifying role can
-- still open and review/approve it (per user decision) — this column only
-- targets who gets notified/highlighted, it isn't an access restriction.

alter table inspections add column if not exists assigned_reviewer_id uuid references users(id);
