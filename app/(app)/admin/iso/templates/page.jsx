"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const DOC_TYPES = ["policy", "procedure", "form", "record"];

export default function IsoTemplatesPage() {
  const { isSuperAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [standards, setStandards] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newTemplate, setNewTemplate] = useState({ title: "", document_type: "policy", template_content: "" });
  const [pickerStandardId, setPickerStandardId] = useState("");
  const [selectedClauseIds, setSelectedClauseIds] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const [{ data: templateData }, { data: standardData }, { data: clauseData }] = await Promise.all([
      supabase
        .from("iso_document_templates")
        .select("*, iso_template_clauses(clause:iso_clauses(id, clause_reference, title, standard_id, standard:iso_standards(code)))")
        .order("title"),
      supabase.from("iso_standards").select("*").order("code"),
      supabase.from("iso_clauses").select("*").order("sort_order"),
    ]);
    setTemplates(templateData || []);
    setStandards(standardData || []);
    setClauses(clauseData || []);
    setLoading(false);
  }

  function toggleClause(clauseId) {
    setSelectedClauseIds((ids) => (ids.includes(clauseId) ? ids.filter((id) => id !== clauseId) : [...ids, clauseId]));
  }

  async function addTemplate(e) {
    e.preventDefault();
    if (!newTemplate.title.trim()) return;
    const { data: template, error } = await supabase
      .from("iso_document_templates")
      .insert({
        title: newTemplate.title.trim(),
        document_type: newTemplate.document_type,
        template_content: newTemplate.template_content,
      })
      .select()
      .single();
    if (error) return alert(error.message);

    if (selectedClauseIds.length > 0) {
      const { error: clauseError } = await supabase
        .from("iso_template_clauses")
        .insert(selectedClauseIds.map((clause_id) => ({ template_id: template.id, clause_id })));
      if (clauseError) return alert(clauseError.message);
    }

    setNewTemplate({ title: "", document_type: "policy", template_content: "" });
    setSelectedClauseIds([]);
    setPickerStandardId("");
    load();
  }

  async function deleteTemplate(id) {
    if (!confirm("Delete this template? Documents already created from it are unaffected.")) return;
    const { error } = await supabase.from("iso_document_templates").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  const clausesForPicker = clauses.filter((c) => c.standard_id === pickerStandardId);
  const selectedClauseDetails = clauses.filter((c) => selectedClauseIds.includes(c.id));

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">ISO Excellence — document template library</h1>
        <p className="text-sm text-slate-500">Your reusable policy/procedure wording, tagged to clauses across one or more standards. Reused across every client.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {templates.length === 0 && <p className="text-sm text-slate-400">No templates yet.</p>}
            {templates.map((t) => {
              const tags = (t.iso_template_clauses || []).map((tc) => tc.clause).filter(Boolean);
              return (
                <div key={t.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-400 uppercase">{t.document_type}</p>
                    </div>
                    <button onClick={() => deleteTemplate(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete template">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((c) => (
                        <span key={c.id} className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
                          {c.standard?.code} · {c.clause_reference}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.template_content && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap line-clamp-3">{t.template_content}</p>}
                </div>
              );
            })}
          </div>

          <form onSubmit={addTemplate} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Add a template</h2>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Title, e.g. H&S Policy"
                value={newTemplate.title}
                onChange={(e) => setNewTemplate((p) => ({ ...p, title: e.target.value }))}
                className="col-span-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={newTemplate.document_type}
                onChange={(e) => setNewTemplate((p) => ({ ...p, document_type: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {DOC_TYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
            <textarea
              placeholder="Template content..."
              value={newTemplate.template_content}
              onChange={(e) => setNewTemplate((p) => ({ ...p, template_content: e.target.value }))}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
            />

            <div>
              <label className="text-xs font-medium text-slate-500">Tag clauses</label>
              {selectedClauseDetails.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {selectedClauseDetails.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggleClause(c.id)}
                      className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5 hover:bg-indigo-100"
                    >
                      {standards.find((s) => s.id === c.standard_id)?.code} · {c.clause_reference} ×
                    </button>
                  ))}
                </div>
              )}
              <select
                value={pickerStandardId}
                onChange={(e) => setPickerStandardId(e.target.value)}
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choose a standard to browse its clauses...</option>
                {standards.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {pickerStandardId && (
                <div className="mt-2 border border-slate-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                  {clausesForPicker.length === 0 && (
                    <p className="text-xs text-slate-400 px-1">No clauses defined for this standard yet.</p>
                  )}
                  {clausesForPicker.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-slate-50">
                      <input type="checkbox" checked={selectedClauseIds.includes(c.id)} onChange={() => toggleClause(c.id)} />
                      <span className="text-slate-700">{c.clause_reference} — {c.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add template
            </button>
          </form>
        </>
      )}
    </main>
  );
}
