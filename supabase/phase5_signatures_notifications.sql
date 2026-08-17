-- Electronic signatures + in-app notifications. Run in the Supabase SQL Editor.

-- ============================================================
-- SIGNATURES — who actually reviewed/approved, and their signature image,
-- not just a status flag. Also backfills who did the review/approve step,
-- which wasn't being tracked before.
-- ============================================================

alter table inspections add column if not exists reviewed_by uuid references users(id);
alter table inspections add column if not exists reviewed_at timestamptz;
alter table inspections add column if not exists approved_by uuid references users(id);
alter table inspections add column if not exists approved_at timestamptz;
alter table inspections add column if not exists inspector_signature_url text;
alter table inspections add column if not exists inspector_signed_at timestamptz;
alter table inspections add column if not exists approver_signature_url text;
alter table inspections add column if not exists approver_signed_at timestamptz;

-- ============================================================
-- NOTIFICATIONS — in-app only for now. Real email delivery needs a
-- transactional email provider (e.g. Resend, Postmark) wired up separately
-- via a server-side function — that's a follow-up step, not part of this.
-- ============================================================

create type notification_type as enum ('observation_assigned', 'inspection_submitted', 'inspection_approved');

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  link text, -- e.g. /observations or /inspections/<id>, so clicking it goes somewhere useful
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Per-user, per-category on/off switches — this is the "customizable" part.
-- All default to true so nobody misses something important by accident;
-- someone can quiet a category down from their own settings.
create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  observation_assigned boolean not null default true,
  inspection_submitted boolean not null default true,
  inspection_approved boolean not null default true
);

alter table notifications enable row level security;
alter table notification_preferences enable row level security;

drop policy if exists "notifications read own" on notifications;
create policy "notifications read own" on notifications for select
  using (user_id = auth.uid());

drop policy if exists "notifications update own" on notifications;
create policy "notifications update own" on notifications for update
  using (user_id = auth.uid());

-- Anyone approved can create a notification FOR someone else (e.g. the app
-- inserting "you've been assigned an observation" for a different user) —
-- this is safe because notifications are inert, informational rows with no
-- side effects of their own.
drop policy if exists "notifications insert" on notifications;
create policy "notifications insert" on notifications for insert
  with check (auth.uid() is not null);

-- Split so `notify()` can read the *target* user's prefs (e.g. when
-- assigning an observation to someone else) — a self-only select would
-- silently block that read via RLS and defeat the whole point of the
-- toggle. Writes stay self-only.
drop policy if exists "notification_preferences own" on notification_preferences;

create policy "notification_preferences read" on notification_preferences for select
  using (auth.uid() is not null);

create policy "notification_preferences write own" on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
