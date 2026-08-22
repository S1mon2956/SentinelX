-- phase20_activity_log_retention.sql
-- Activity log for non-compliance activity (logins, approvals/rejections,
-- record edits). Deliberately separate from audit_log, which is immutable
-- forever by design — audit_log is untouched by this migration.

create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null, -- 'login' | 'approval' | 'rejection' | 'record_edit'
  entity_table text,
  entity_id uuid,
  actor_id uuid references users(id),
  detail jsonb,
  created_at timestamptz default now()
);
alter table activity_log enable row level security;

create policy "activity_log read" on activity_log for select
  using (public.is_super_admin());

-- FIX: insert must be tied to the actual caller, not just "someone is
-- logged in" — otherwise any authenticated user could insert rows
-- claiming to be a different actor_id, or fabricate approval/rejection
-- events. Server-side inserts via a service-role key bypass RLS
-- entirely, so this only constrains direct client-side inserts, which
-- is exactly what we want.
create policy "activity_log insert" on activity_log for insert
  with check (auth.uid() is not null and actor_id = auth.uid());

-- One row per retention run, dry-run or real, so there's an audit trail
-- of the housekeeping job itself.
create table activity_log_retention_runs (
  id uuid primary key default uuid_generate_v4(),
  ran_at timestamptz default now(),
  dry_run boolean not null,
  cutoff timestamptz not null,
  rows_matched int not null
);
alter table activity_log_retention_runs enable row level security;

create policy "activity_log_retention_runs read" on activity_log_retention_runs for select
  using (public.is_super_admin());

-- dry_run=true (the default) only counts and logs what would be deleted.
-- dry_run=false actually deletes. Same function either way, so the
-- cron job's behavior is controlled entirely by which argument it's
-- scheduled with.
create or replace function public.cleanup_activity_log(dry_run boolean default true)
returns table(rows_matched int, cutoff timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '18 months';
  v_count int;
begin
  if dry_run then
    select count(*) into v_count from activity_log where created_at < v_cutoff;
  else
    with deleted as (
      delete from activity_log where created_at < v_cutoff returning 1
    )
    select count(*) into v_count from deleted;
  end if;
  insert into activity_log_retention_runs (dry_run, cutoff, rows_matched)
  values (dry_run, v_cutoff, v_count);
  return query select v_count, v_cutoff;
end;
$$;

-- FIX: lock down who can call this. Without this, EXECUTE defaults to
-- PUBLIC and any authenticated user could call cleanup_activity_log(false)
-- directly and force a real deletion, bypassing the dry-run safeguard
-- entirely. pg_cron runs as the function owner, so this doesn't break
-- the schedule below.
revoke execute on function public.cleanup_activity_log(boolean) from public;
revoke execute on function public.cleanup_activity_log(boolean) from anon, authenticated;

-- pg_cron extension — may already be enabled via the Supabase dashboard
-- (Database > Extensions); this is a no-op if so.
create extension if not exists pg_cron with schema extensions;

-- Scheduled DRY-RUN ONLY, monthly. Deliberately not deleting anything
-- yet — run this for at least one cycle, check
-- activity_log_retention_runs for sane rows_matched counts, then take
-- the switch to dry_run:=false through review separately before
-- enabling real deletion.
select cron.schedule(
  'activity-log-retention-dry-run',
  '0 3 1 * *', -- 03:00 on the 1st of every month
  $$ select public.cleanup_activity_log(true); $$
);
