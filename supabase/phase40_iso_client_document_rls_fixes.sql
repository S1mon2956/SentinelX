-- Fix 1: uploaded_by ownership bypassed the approved-membership check —
-- a removed/rejected user kept edit/delete rights on their own old uploads forever
DROP POLICY "Iso documents update access" ON public.iso_documents;
CREATE POLICY "Iso documents update access"
ON public.iso_documents FOR UPDATE
USING (has_iso_access(iso_organization_id, 'documents') AND (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid()))
WITH CHECK (has_iso_access(iso_organization_id, 'documents') AND (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid()));

DROP POLICY "Iso documents delete access" ON public.iso_documents;
CREATE POLICY "Iso documents delete access"
ON public.iso_documents FOR DELETE
USING (has_iso_access(iso_organization_id, 'documents') AND (has_iso_member_access(iso_organization_id) OR uploaded_by = auth.uid()));

-- Fix 2: storage bucket had no ownership check at all — split it to
-- mirror the DB table's read/insert/update/delete split, resolving
-- ownership via the document row (path's 2nd segment is the document id)
DROP POLICY "Scoped access to iso client document files" ON storage.objects;

CREATE POLICY "Iso client document files read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'iso-documents' AND has_iso_access((storage.foldername(name))[1]::uuid, 'documents'));

CREATE POLICY "Iso client document files insert access"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'iso-documents' AND has_iso_access((storage.foldername(name))[1]::uuid, 'documents'));

CREATE POLICY "Iso client document files update access"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'iso-documents'
  AND has_iso_access((storage.foldername(name))[1]::uuid, 'documents')
  AND (
    has_iso_member_access((storage.foldername(name))[1]::uuid)
    OR EXISTS (SELECT 1 FROM public.iso_documents d WHERE d.id = (storage.foldername(name))[2]::uuid AND d.uploaded_by = auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'iso-documents'
  AND has_iso_access((storage.foldername(name))[1]::uuid, 'documents')
  AND (
    has_iso_member_access((storage.foldername(name))[1]::uuid)
    OR EXISTS (SELECT 1 FROM public.iso_documents d WHERE d.id = (storage.foldername(name))[2]::uuid AND d.uploaded_by = auth.uid())
  )
);

CREATE POLICY "Iso client document files delete access"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'iso-documents'
  AND has_iso_access((storage.foldername(name))[1]::uuid, 'documents')
  AND (
    has_iso_member_access((storage.foldername(name))[1]::uuid)
    OR EXISTS (SELECT 1 FROM public.iso_documents d WHERE d.id = (storage.foldername(name))[2]::uuid AND d.uploaded_by = auth.uid())
  )
);

-- Fix 3: restricted users had no way to read which standards/clauses
-- are enrolled for their org at all — new read-only helper, additive
-- SELECT policies alongside the existing member-only ALL policies
-- (write/enrollment-toggling stays member-only, unchanged)
CREATE OR REPLACE FUNCTION public.has_iso_org_access(check_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from iso_organization_memberships m
    where m.iso_organization_id = check_org_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
  );
$function$;

CREATE POLICY "Restricted users read organization standards"
ON public.iso_organization_standards FOR SELECT
USING (has_iso_org_access(iso_organization_id));

CREATE POLICY "Restricted users read organization clauses"
ON public.iso_organization_clauses FOR SELECT
USING (has_iso_org_access(iso_organization_id));
