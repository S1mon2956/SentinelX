-- Additive columns for client-facing document uploads and future AI-drafted docs
ALTER TABLE public.iso_documents
  ADD COLUMN file_path text,
  ADD COLUMN uploaded_by uuid REFERENCES auth.users(id),
  ADD COLUMN source text NOT NULL DEFAULT 'template'
    CHECK (source IN ('template', 'client_upload', 'ai_draft'));

-- New private storage bucket for client-uploaded documents
insert into storage.buckets (id, name, public) values ('iso-documents', 'iso-documents', false);

create policy "Scoped access to iso client document files"
on storage.objects for all
using (bucket_id = 'iso-documents' and has_iso_access((storage.foldername(name))[1]::uuid, 'documents'))
with check (bucket_id = 'iso-documents' and has_iso_access((storage.foldername(name))[1]::uuid, 'documents'));

create policy "Super admin manages iso client document files"
on storage.objects for all
using (bucket_id = 'iso-documents' and is_super_admin())
with check (bucket_id = 'iso-documents' and is_super_admin());

-- Split the existing blanket iso_documents policy so restricted users
-- can only edit/delete their own uploads, not any org document
DROP POLICY "Scoped access to iso documents" ON public.iso_documents;

CREATE POLICY "Iso documents read access"
ON public.iso_documents FOR SELECT
USING (has_iso_access(iso_organization_id, 'documents'));

CREATE POLICY "Iso documents insert access"
ON public.iso_documents FOR INSERT
WITH CHECK (has_iso_access(iso_organization_id, 'documents'));

CREATE POLICY "Iso documents update access"
ON public.iso_documents FOR UPDATE
USING (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid())
WITH CHECK (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid());

CREATE POLICY "Iso documents delete access"
ON public.iso_documents FOR DELETE
USING (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid());
