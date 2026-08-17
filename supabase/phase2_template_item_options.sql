-- Adds the options list for multiple_choice template items. Idempotent —
-- safe to re-run. Run this against the live Supabase project; schema.sql is
-- also updated so fresh installs pick it up without needing this file.

alter table template_items add column if not exists options text[];
