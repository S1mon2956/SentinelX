"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const STATUSES = ["draft", "in_review", "approved", "superseded"];

export default function IsoDocumentRegisterPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [enrolledStandards, setEnrolledStandards] = useState([]); // [{ id, standard: {id, code, name} }]
  const [allStandards, setAllStandards] = useState([]);
  const [clauses, setClauses] = useState([]); // clauses for every enrolled standard
  const [orgClauses, setOrgClauses] = useState([]); // iso_organization_clauses rows
  const [templates, setTemplates] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [editContent, setEditContent] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [blankTitle, setBlankTitle] = useState("");
  const [enrollStandardId, setEnrollStandardId] = useState("");

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

    const [
      { data: org },
      { data: orgStandardsData },
      { data: allStandardsData },
      { data: orgClausesData },
      { data: templateData },
      { data: docsData },
    ] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_organization_standards").select("id, standard:iso_standards(id, code, name)").eq("iso_organization_id", orgId),
      supabase.from("iso_standards").select("*").order("code"),
      supabase.from("iso_organization_clauses").select("*").eq("iso_organization_id", orgId),
      supabase.from("iso_document_templates").select("*, iso_template_clauses(clause_id)").order("title"),
      supabase
        .from("iso_documents")
        .select("*, iso_document_clauses(id, clause:iso_clauses(id, clause_reference, title, standard:iso_standards(code)))")
        .eq("iso_organization_id", orgId),
    ]);

    const enrolledStandardIds = (orgStandardsData || []).map((s) => s.standard?.id).filter(Boolean);
    let clausesData = [];
    if (enrolledStandardIds.length > 0) {
      const { data } = await supabase.from("iso_clauses").select("*").in("standard_id", enrolledStandardIds).order("sort_order");
      clausesData = data || [];
    }

    const docIds = (docsData || []).map((d) => d.id);
    let versions = [];
    if (docIds.length > 0) {
      const { data: v } = await supabase
        .from("iso_document_versions")
        .select("*")
        .in("iso_document_id", docIds)
        .order("version_number", { ascending: true });
      versions = v || [];
    }
    const docsWithVersions = (docsData || []).map((d) => {
      const docVersions = versions.filter((v) => v.iso_document_id === d.id);
      return { ...d, latest: docVersions[docVersions.length - 1] || null, versionCount: docVersions.length };
    });

    setOrgName(org?.name || "");
    setEnrolledStandards(orgStandardsData || []);
    setAllStandards(allStandardsData || []);
    setClauses(clausesData);
    setOrgClauses(orgClausesData || []);
    setTemplates(templateData || []);
    setDocuments(docsWithVersions);
    setLoading(false);
  }

  // ── Standard enrollment ────────────────────────────────────────────────

  async function enrollStandard(e) {
    e.preventDefault();
    if (!enrollStandardId) return;
    const { error } = await supabase
      .from("iso_organization_standards")
      .insert({ iso_organization_id: orgId, standard_id: enrollStandardId });
    if (error) return alert(error.message);

    // Opt-out model: every clause of the newly-enrolled standard starts in
    // scope; toggle individual ones off below if they don't apply here.
    const { data: standardClauses } = await supabase.from("iso_clauses").select("id").eq("standard_id", enrollStandardId);
    if (standardClauses && standardClauses.length > 0) {
      const { error: clauseError } = await supabase
        .from("iso_organization_clauses")
        .insert(standardClauses.map((c) => ({ iso_organization_id: orgId, clause_id: c.id, is_active: true })));
      if (clauseError) return alert(clauseError.message);
    }

    setEnrollStandardId("");
    load();
  }

  function orgClauseFor(clauseId) {
    return orgClauses.find((oc) => oc.clause_id === clauseId);
  }

  async function toggleClauseActive(clause) {
    const existing = orgClauseFor(clause.id);
    if (existing) {
      const { error } = await supabase.from("iso_organization_clauses").update({ is_active: !existing.is_active }).eq("id", existing.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase
        .from("iso_organization_clauses")
        .insert({ iso_organization_id: orgId, clause_id: clause.id, is_active: true });
      if (error) return alert(error.message);
    }
    load();
  }

  const clausesByStandard = enrolledStandards
    .map((es) => ({ standard: es.standard, clauses: clauses.filter((c) => c.standard_id === es.standard?.id) }))
    .filter((g) => g.standard);

  const unenrolledStandards = allStandards.filter((s) => !enrolledStandards.some((es) => es.standard?.id === s.id));

  const activeOrgClauses = clauses.filter((c) => orgClauseFor(c.id)?.is_active);

  // ── Documents ───────────────────────────────────────────────────────────

  async function addFromTemplate(e) {
    e.preventDefault();
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    const { data: doc, error } = await supabase
      .from("iso_documents")
      .insert({
        iso_organization_id: orgId,
        template_id: template.id,
        title: template.title,
        document_type: template.document_type,
        status: "draft",
      })
      .select()
      .single();
    if (error) return alert(error.message);

    const { data: userData } = await supabase.auth.getUser();
    const { error: versionError } = await supabase.from("iso_document_versions").insert({
      iso_document_id: doc.id,
      version_number: 1,
      content: template.template_content || "",
      created_by: userData?.user?.id,
    });
    if (versionError) return alert(versionError.message);

    // Clause tags start as a copy of the template's — editable afterwards
    // via the same checklist used below, not locked to the template.
    const templateClauseIds = (template.iso_template_clauses || []).map((tc) => tc.clause_id);
    if (templateClauseIds.length > 0) {
      const { error: clauseError } = await supabase
        .from("iso_document_clauses")
        .insert(templateClauseIds.map((clause_id) => ({ iso_document_id: doc.id, clause_id })));
      if (clauseError) return alert(clauseError.message);
    }

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
    const { error: versionError } = await supabase.from("iso_document_versions").insert({
      iso_document_id: doc.id,
      version_number: 1,
      content: "",
      created_by: userData?.user?.id,
    });
    if (versionError) return alert(versionError.message);
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

  async function toggleDocClause(doc, clause) {
    const existingLink = (doc.iso_document_clauses || []).find((dc) => dc.clause?.id === clause.id);
    if (existingLink) {
      const { error } = await supabase.from("iso_document_clauses").delete().eq("id", existingLink.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("iso_document_clauses").insert({ iso_document_id: doc.id, clause_id: clause.id });
      if (error) return alert(error.message);
    }
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — document register</h1>
        <p className="text-sm text-slate-500">Documents for this client, version-controlled, tagged against the standards and clauses they're enrolled in.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          {/* ── Standards & clause scope ──────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Standards & clause scope</h2>

            {clausesByStandard.length === 0 && (
              <p className="text-sm text-slate-400">Not enrolled in any standard yet — enroll below.</p>
            )}

            {clausesByStandard.map((group) => (
              <div key={group.standard.id}>
                <p className="text-xs font-semibold text-indigo-700 uppercase mb-1">
                  ISO {group.standard.code} — {group.standard.name}
                </p>
                {group.clauses.length === 0 && (
                  <p className="text-xs text-slate-400">No clauses defined for this standard yet.</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {group.clauses.map((c) => {
                    const active = orgClauseFor(c.id)?.is_active;
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleClauseActive(c)}
                        title={c.title}
                        className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {c.clause_reference}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {unenrolledStandards.length > 0 && (
              <form onSubmit={enrollStandard} className="flex gap-2 pt-2 border-t border-slate-100">
                <select
                  value={enrollStandardId}
                  onChange={(e) => setEnrollStandardId(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Choose a standard to enroll in...</option>
                  {unenrolledStandards.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
                  Enroll
                </button>
              </form>
            )}
          </div>

          {/* ── Documents ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            {documents.length === 0 && <p className="text-sm text-slate-400">No documents yet — add one below.</p>}
            {documents.map((d) => {
              const tags = (d.iso_document_clauses || []).map((dc) => dc.clause).filter(Boolean);
              return (
                <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-400 uppercase">{d.document_type} · v{d.versionCount || 0}</p>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tags.map((c) => (
                            <span key={c.id} className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
                              {c.standard?.code} · {c.clause_reference}
                            </span>
                          ))}
                        </div>
                      )}
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
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
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

                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">Clauses this document satisfies</p>
                        {activeOrgClauses.length === 0 && (
                          <p className="text-xs text-slate-400">No active clauses in scope for this client yet.</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {activeOrgClauses.map((c) => {
                            const linked = (d.iso_document_clauses || []).some((dc) => dc.clause?.id === c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => toggleDocClause(d, c)}
                                title={c.title}
                                className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                                  linked ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                                }`}
                              >
                                {standardCodeFor(clausesByStandard, c)} · {c.clause_reference}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                  <option key={t.id} value={t.id}>{t.title}</option>
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

// Clauses fetched for the scope section already carry standard_id but not
// the joined standard row itself; this looks the code up from the grouped
// scope data instead of firing another query per chip.
function standardCodeFor(clausesByStandard, clause) {
  const group = clausesByStandard.find((g) => g.standard.id === clause.standard_id);
  return group?.standard.code;
}
