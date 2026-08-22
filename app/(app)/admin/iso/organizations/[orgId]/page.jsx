"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const STATUSES = ["draft", "in_review", "approved", "superseded"];

export default function IsoDocumentRegisterPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [editContent, setEditContent] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [blankTitle, setBlankTitle] = useState("");

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  useEffect(() => {
    setEditContent((prev) => {
      const next = { ...prev };
      documents.forEach((d) => {
        if (!(d.id in next)) next[d.id] = d.latest?.content || "";
      });
      return next;
    });
  }, [documents]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: docs }, { data: templateData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_documents").select("*").eq("iso_organization_id", orgId).order("clause_reference"),
      supabase.from("iso_document_templates").select("*").order("clause_reference"),
    ]);
    const docIds = (docs || []).map((d) => d.id);
    let versions = [];
    if (docIds.length) {
      const { data: v } = await supabase
        .from("iso_document_versions")
        .select("*")
        .in("iso_document_id", docIds)
        .order("version_number", { ascending: true });
      versions = v || [];
    }
    const docsWithVersions = (docs || []).map((d) => {
      const docVersions = versions.filter((v) => v.iso_document_id === d.id);
      return { ...d, latest: docVersions[docVersions.length - 1] || null, versionCount: docVersions.length };
    });
    setOrgName(org?.name || "");
    setTemplates(templateData || []);
    setDocuments(docsWithVersions);
    setLoading(false);
  }

  async function addFromTemplate(e) {
    e.preventDefault();
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    const { data: doc, error } = await supabase
      .from("iso_documents")
      .insert({
        iso_organization_id: orgId,
        template_id: template.id,
        clause_reference: template.clause_reference,
        title: template.title,
        document_type: template.document_type,
        status: "draft",
      })
      .select()
      .single();
    if (error) return alert(error.message);
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("iso_document_versions").insert({
      iso_document_id: doc.id,
      version_number: 1,
      content: template.template_content || "",
      created_by: userData?.user?.id,
    });
    setSelectedTemplateId("");
    load();
  }

  async function addBlank(e) {
    e.preventDefault();
    if (!blankTitle.trim()) return;
    const { data: doc, error } = await supabase
      .from("iso_documents")
      .insert({ iso_organization_id: orgId, title: blankTitle.trim(), status: "draft" })
      .select()
      .single();
    if (error) return alert(error.message);
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("iso_document_versions").insert({
      iso_document_id: doc.id,
      version_number: 1,
      content: "",
      created_by: userData?.user?.id,
    });
    setBlankTitle("");
    load();
  }

  async function saveNewVersion(doc) {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("iso_document_versions").insert({
      iso_document_id: doc.id,
      version_number: (doc.versionCount || 0) + 1,
      content: editContent[doc.id] || "",
      created_by: userData?.user?.id,
    });
    if (error) return alert(error.message);
    load();
  }

  async function updateStatus(docId, status) {
    const { error } = await supabase.from("iso_documents").update({ status }).eq("id", docId);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — document register</h1>
        <p className="text-sm text-slate-500">ISO 45001 documents for this client, version-controlled.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="space-y-3">
            {documents.length === 0 && <p className="text-sm text-slate-400">No documents yet — add one below.</p>}
            {documents.map((d) => (
              <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {d.clause_reference && <span className="text-xs text-slate-400 mr-2">Clause {d.clause_reference}</span>}
                      {d.title}
                    </p>
                    <p className="text-xs text-slate-400 uppercase">{d.document_type} · v{d.versionCount || 0}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={d.status}
                      onChange={(e) => updateStatus(d.id, e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                      className="text-xs font-medium text-indigo-600 underline"
                    >
                      {expandedId === d.id ? "Close" : "Edit"}
                    </button>
                  </div>
                </div>

                {expandedId === d.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <textarea
                      value={editContent[d.id] || ""}
                      onChange={(e) => setEditContent((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      rows={10}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                    <button
                      onClick={() => saveNewVersion(d)}
                      className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
                    >
                      Save as version {(d.versionCount || 0) + 1}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <form onSubmit={addFromTemplate} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Add from template</h2>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choose a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.clause_reference ? `${t.clause_reference} — ` : ""}{t.title}</option>
                ))}
              </select>
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add
              </button>
            </form>

            <form onSubmit={addBlank} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Add blank document</h2>
              <input
                placeholder="Title"
                value={blankTitle}
                onChange={(e) => setBlankTitle(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                Add
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
