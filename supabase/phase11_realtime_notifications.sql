-- NotificationBell subscribes to postgres_changes on `notifications`, but the
-- table was never added to the supabase_realtime publication — so the bell only
-- ever picked up new notifications on page load, never live.
--
-- Idempotent: adding a table that's already in the publication is an error,
-- so this checks first. Safe to re-run.
--
-- Run in the Supabase SQL Editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end
$$;

-- Realtime respects RLS on the subscribing user's connection, and the existing
-- existing "notifications read own" policy already limits rows to
-- user_id = auth.uid(),
-- so this doesn't widen who can see what.
