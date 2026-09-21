"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoDisclaimer from "@/components/IsoDisclaimer";
import IsoDocumentStatusBadge from "@/components/IsoDocumentStatusBadge";

export default function IsoClauseDetailPage() {
  const { orgId, standardId, clauseId } = useParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [clause, setClause] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [openDocId, setOpenDocId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [viewedContent, setViewedContent] = useState({});

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    load();
  }, [orgId, clauseId]);

  async function load() {
    setLoading(true);
    const [{ data: clauseData }, { data: docLinks }] = await Promise.all([
      supabase.from("iso_clauses").select("*").eq("id", clauseId).single(),
      supabase
        .from("iso_document_clauses")
        .select("iso_documents(id, title, document_type, status, source, file_path, created_at)")
        .eq("clause_id", clauseId),
    ]);
    setClause(clauseData || null);
    setDocuments((docLinks || []).map((r) => r.iso_documents).filter(Boolean));
    setLoading(false);
  }

  async function viewDocument(doc) {
    if (doc.file_path) {
      setViewingId(doc.id);
      const { data, error } = await supabase.storage.from("iso-documents").createSignedUrl(doc.file_path, 3600);
      setViewingId(null);
      if (error || !data?.signedUrl) {
        alert(`Couldn't open this document: ${error?.message || "no signed URL returned"}`);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // No uploaded file — this is a template/editor-based document, show its
    // latest version content inline instead of opening a file.
    if (openDocId === doc.id) {
      setOpenDocId(null);
      return;
    }
    if (!viewedContent[doc.id]) {
      setViewingId(doc.id);
      const { data } = await supabase
        .from("iso_document_versions")
        .select("content")
        .eq("iso_document_id", doc.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      setViewingId(null);
      setViewedContent((prev) => ({ ...prev, [doc.id]: data?.content || "(no content yet)" }));
    }
    setOpenDocId(doc.id);
  }

  async function uploadDocument(e) {
    e.preventDefault();
    if (!uploadTitle.trim()) return alert("Give the document a title.");
    if (!uploadFile) return alert("Choose a file to upload.");

    setUploading(true);

    // Upload first, then insert the row with the resulting path — a storage
    // failure must never leave behind a DB row pointing at a file that was
    // never actually saved (same rationale as the iso-audit-reports upload).
    const documentId = crypto.randomUUID();
    const path = `${orgId}/${documentId}/${uploadFile.name}`;
    const { error: uploadError } = await supabase.storage.from("iso-documents").upload(path, uploadFile);
    if (uploadError) {
      setUploading(false);
      alert(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { error: insertError } = await supabase.from("iso_documents").insert({
      id: documentId,
      iso_organization_id: orgId,
      title: uploadTitle.trim(),
      document_type: "record",
      source: "client_upload",
      file_path: path,
      uploaded_by: profile?.id || null,
    });
    if (insertError) {
      setUploading(false);
      alert(`Document record failed to save: ${insertError.message}`);
      return;
    }

    const { error: tagError } = await supabase
      .from("iso_document_clauses")
      .insert({ iso_document_id: documentId, clause_id: clauseId });

    setUploading(false);
    if (tagError) {
      alert(`Document saved but couldn't be linked to this clause: ${tagError.message}`);
    }

    setUploadTitle("");
    setUploadFile(null);
    setShowUploadForm(false);
    load();
  }

  if (loading) return <main className="p-6 text-sm text-slate-500">Loading...</main>;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <Link href={`/iso/${orgId}/standards/${standardId}`} className="text-xs font-medium text-indigo-600 underline">
          &larr; Back to clauses
        </Link>
        <h1 className="text-xl font-semibold text-slate-800 mt-1">
          {clause?.clause_reference} — {clause?.title}
        </h1>
        {clause?.description && <p className="text-sm text-slate-500 mt-1">{clause.description}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Documents</h2>

        {documents.length === 0 && <p className="text-sm text-slate-400">No documents for this clause yet.</p>}

        {documents.map((doc) => (
          <div key={doc.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{doc.title}</p>
                <p className="text-xs text-slate-400 uppercase">{doc.document_type}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <IsoDocumentStatusBadge status={doc.status} />
                <button
                  onClick={() => viewDocument(doc)}
                  disabled={viewingId === doc.id}
                  className="text-xs font-medium text-indigo-600 underline disabled:opacity-50"
                >
                  {viewingId === doc.id ? "Opening..." : openDocId === doc.id ? "Hide" : "View"}
                </button>
              </div>
            </div>
            {openDocId === doc.id && !doc.file_path && (
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                {viewedContent[doc.id]}
              </pre>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setShowUploadForm((v) => !v)}
            className="text-sm font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Upload your own document
          </button>
          <button
            disabled
            title="Coming soon"
            className="text-sm font-medium px-3 py-2 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
          >
            Answer guided questions
          </button>
        </div>

        {showUploadForm && (
          <form onSubmit={uploadDocument} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
            <input
              placeholder="Document title"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
            <button
              type="submit"
              disabled={uploading}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>
        )}
      </div>

      <IsoDisclaimer />
    </main>
  );
}
