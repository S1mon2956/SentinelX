"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const DOC_TYPES = ["policy", "procedure", "form", "record"];

export default function IsoTemplatesPage() {
  const { isSuperAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTemplate, setNewTemplate] = useState({ clause_reference: "", title: "", document_type: "policy", template_content: "" });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("iso_document_templates").select("*").order("clause_reference");
    setTemplates(data || []);
    setLoading(false);
  }

  async function addTemplate(e) {
    e.preventDefault();
    if (!newTemplate.title.trim()) return;
    const { error } = await supabase.from("iso_document_templates").insert({
      clause_reference: newTemplate.clause_reference.trim() || null,
      title: newTemplate.title.trim(),
      document_type: newTemplate.document_type,
      template_content: newTemplate.template_content,
    });
    if (error) return alert(error.message);
    setNewTemplate({ clause_reference: "", title: "", document_type: "policy", template_content: "" });
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

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">ISO Excellence — document template library</h1>
        <p className="text-sm text-slate-500">Your reusable policy/procedure wording, mapped to clause numbers. Reused across every client.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {templates.length === 0 && <p className="text-sm text-slate-400">No templates yet.</p>}
            {templates.map((t) => (
              <div key={t.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t.clause_reference && <span className="text-xs text-slate-400 mr-2">Clause {t.clause_reference}</span>}
                      {t.title}
                    </p>
                    <p className="text-xs text-slate-400 uppercase">{t.document_type}</p>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete template">
                    <Trash2 size={14} />
                  </button>
                </div>
                {t.template_content && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap line-clamp-3">{t.template_content}</p>}
              </div>
            ))}
          </div>

          <form onSubmit={addTemplate} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Add a template</h2>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Clause, e.g. 5.2"
                value={newTemplate.clause_reference}
                onChange={(e) => setNewTemplate((p) => ({ ...p, clause_reference: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Title, e.g. H&S Policy"
                value={newTemplate.title}
                onChange={(e) => setNewTemplate((p) => ({ ...p, title: e.target.value }))}
                className="col-span-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <select
              value={newTemplate.document_type}
              onChange={(e) => setNewTemplate((p) => ({ ...p, document_type: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {DOC_TYPES.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
            </select>
            <textarea
              placeholder="Template content..."
              value={newTemplate.template_content}
              onChange={(e) => setNewTemplate((p) => ({ ...p, template_content: e.target.value }))}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add template
            </button>
          </form>
        </>
      )}
    </main>
  );
}
