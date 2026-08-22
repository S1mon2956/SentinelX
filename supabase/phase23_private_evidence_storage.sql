-- Phase 23: private storage for evidence photos, inspection sign-off
-- signatures, and asset thorough-exam certificates.
--
-- The "evidence" storage bucket is currently public with only an
-- INSERT-only policy (no SELECT policy at all) — any object's URL is
-- fetchable by anyone, no auth required.
--
-- Originally this migration only covered evidence.file_url,
-- observations.photo_url and observations.closed_photo_url, deferring
-- inspections.inspector_signature_url / approver_signature_url and
-- assets.thorough_exam_cert_url to a follow-up. That deferral assumed the
-- deferred columns would stay in the same exposed-but-working state in the
-- meantime. A grep turned up that assets/page.jsx and the sign-off display
-- in inspections/[id]/page.jsx both read these via getPublicUrl/a stored
-- public URL — so flipping the bucket private without fixing them doesn't
-- defer anything, it silently breaks new cert uploads and dead-links every
-- existing signature the moment this runs. All six columns are folded in
-- together instead.
--
-- Design: rather than embedding an authorization-relevant ID in every
-- object's path (which would make existing objects silently unreadable),
-- SELECT access is decided by a metadata lookup — does any row across
-- evidence/observations/inspections/assets reference this exact object
-- path, on a site the requesting user is approved on? No existing object
-- needs to move. Only new INSERT traffic needs a path convention, since
-- that's the one case a metadata lookup can't apply (the DB row doesn't
-- exist yet when the file lands in storage) — new uploads go forward
-- embedding site_id as the first path segment.

-- ============================================================
-- STEP 1 — rename columns. Stored values become bare storage paths
-- instead of permanent public URLs; a signed, time-limited URL is
-- generated on demand by whoever is authorized to view it.
-- ============================================================

alter table evidence rename column file_url to file_path;
alter table observations rename column photo_url to photo_path;
alter table observations rename column closed_photo_url to closed_photo_path;
alter table inspections rename column inspector_signature_url to inspector_signature_path;
alter table inspections rename column approver_signature_url to approver_signature_path;
alter table assets rename column thorough_exam_cert_url to thorough_exam_cert_path;

-- ============================================================
-- STEP 2 — PREVIEW ONLY. Run these six SELECTs and actually look at
-- new_path for each row before running STEP 3. Confirm every new_path is
-- a bare storage path (no host, no leading slash, no "/storage/v1/..."
-- left in it) — if anything looks wrong here, stop and don't run STEP 3.
-- ============================================================

select id, file_path as old_value,
       replace(file_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from evidence where file_path is not null;

select id, photo_path as old_value,
       replace(photo_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from observations where photo_path is not null;

select id, closed_photo_path as old_value,
       replace(closed_photo_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from observations where closed_photo_path is not null;

select id, inspector_signature_path as old_value,
       replace(inspector_signature_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from inspections where inspector_signature_path is not null;

select id, approver_signature_path as old_value,
       replace(approver_signature_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from inspections where approver_signature_path is not null;

select id, thorough_exam_cert_path as old_value,
       replace(thorough_exam_cert_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '') as new_path
from assets where thorough_exam_cert_path is not null;

-- ============================================================
-- STEP 3 — apply the same rewrite for real. Only run after STEP 2's
-- output has actually been checked.
-- ============================================================

update evidence
set file_path = replace(file_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where file_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

update observations
set photo_path = replace(photo_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where photo_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

update observations
set closed_photo_path = replace(closed_photo_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where closed_photo_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

update inspections
set inspector_signature_path = replace(inspector_signature_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where inspector_signature_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

update inspections
set approver_signature_path = replace(approver_signature_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where approver_signature_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

update assets
set thorough_exam_cert_path = replace(thorough_exam_cert_path, 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/', '')
where thorough_exam_cert_path like 'https://lpxymfbjcmxvdgiwfmds.supabase.co/storage/v1/object/public/evidence/%';

-- ============================================================
-- STEP 4 — flip the bucket private.
-- ============================================================

update storage.buckets set public = false where id = 'evidence';

-- ============================================================
-- STEP 5 — replace the old dashboard-created INSERT-only policy with a
-- proper SELECT/INSERT pair.
-- ============================================================

drop policy if exists "Authenticated users can upload evidence" on storage.objects;

create policy "Approved site members can view evidence" on storage.objects
for select
using (
  bucket_id = 'evidence'
  and (
    is_super_admin()
    or exists (
      select 1
      from evidence
      join answers on answers.id = evidence.answer_id
      join inspections on inspections.id = answers.inspection_id
      where evidence.file_path = storage.objects.name
        and is_approved_on_site(inspections.site_id)
    )
    or exists (
      select 1
      from observations
      where (observations.photo_path = storage.objects.name or observations.closed_photo_path = storage.objects.name)
        and is_approved_on_site(observations.site_id)
    )
    or exists (
      select 1
      from inspections
      where (inspections.inspector_signature_path = storage.objects.name or inspections.approver_signature_path = storage.objects.name)
        and is_approved_on_site(inspections.site_id)
    )
    or exists (
      select 1
      from assets
      where assets.thorough_exam_cert_path = storage.objects.name
        and is_approved_on_site(assets.site_id)
    )
  )
);

create policy "Approved site members can upload evidence" on storage.objects
for insert
with check (
  bucket_id = 'evidence'
  and (
    is_super_admin()
    or is_approved_on_site(((storage.foldername(name))[1])::uuid)
  )
);
