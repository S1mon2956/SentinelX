-- Phase 35: allow users to delete their own notifications
--
-- notifications had SELECT/UPDATE/INSERT policies (phase5/phase11) but no
-- DELETE — rows accumulate forever with no cleanup path. Scoped to the
-- owning user only, same pattern as "notifications read own".

create policy "notifications delete own" on notifications
  for delete using (user_id = auth.uid());
