-- Phase 18: private storage for signatures and qualification card photos.
-- These are more sensitive than a generic site photo (an ID-like document
-- and a legal signature), so they move off the public "evidence" bucket
-- into a private one, access-controlled by the same ownership/manager
-- rules already used elsewhere in the induction system.

insert into storage.buckets (id, name, public)
values ('personal-documents', 'personal-documents', false)
on conflict (id) do nothing;

create policy "Users upload their own personal documents"
on storage.objects for insert
with check (
  bucket_id = 'personal-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owner or manager can view personal documents"
on storage.objects for select
using (
  bucket_id = 'personal-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_manager_of_site_membership_induction(((storage.foldername(name))[2])::uuid)
  )
);

-- Stored value is now a bare storage path, not a permanent public URL —
-- a signed, time-limited URL is generated on demand by whoever is
-- authorized to view it.
alter table qualification_uploads rename column file_url to file_path;
alter table site_membership_inductions rename column signature_url to signature_path;
