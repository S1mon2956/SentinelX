"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

function blankItem() {
  return { key: crypto.randomUUID(), question: "" };
}

export default function IsoChecklistsPage() {
  const { isSuperAdmin } = useAuth();
  const [checklists, setChecklists] = useState([]);
  const [standards, setStandards] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newChecklist, setNewChecklist] = useState({ title: "", description: "" });
  const [newItems, setNewItems] = useState([blankItem()]);
  const [pickerStandardId, setPickerStandardId] = useState("");
  const [selectedClauseIds, setSelectedClauseIds] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const [{ data: checklistData }, { data: standardData }, { data: clauseData }] = await Promise.all([
      supabase
        .from("iso_checklist_templates")
        .select(
          "*, iso_checklist_items(id, question, sort_order), iso_checklist_template_clauses(clause:iso_clauses(id, clause_reference, title, standard:iso_standards(code)))"
        )
        .order("title"),
      supabase.from("iso_standards").select("*").order("code"),
      supabase.from("iso_clauses").select("*").order("sort_order"),
    ]);
    setChecklists(checklistData || []);
    setStandards(standardData || []);
    setClauses(clauseData || []);
    setLoading(false);
  }

  function updateItem(key, value) {
    setNewItems((its) => its.map((it) => (it.key === key ? { ...it, question: value } : it)));
  }
  function addItemRow() {
    setNewItems((its) => [...its, blankItem()]);
  }
  function removeItemRow(key) {
    setNewItems((its) => its.filter((it) => it.key !== key));
  }

  function toggleClause(clauseId) {
    setSelectedClauseIds((ids) => (ids.includes(clauseId) ? ids.filter((id) => id !== clauseId) : [...ids, clauseId]));
  }

  async function addChecklist(e) {
    e.preventDefault();
    if (!newChecklist.title.trim()) return;
    const cleanItems = newItems.filter((it) => it.question.trim());
    if (cleanItems.length === 0) return alert("Add at least one checklist item.");

    const { data: checklist, error } = await supabase
      .from("iso_checklist_templates")
      .insert({ title: newChecklist.title.trim(), description: newChecklist.description.trim() || null })
      .select()
      .single();
    if (error) return alert(error.message);

    const { error: itemsError } = await supabase
      .from("iso_checklist_items")
      .insert(cleanItems.map((it, idx) => ({ checklist_template_id: checklist.id, question: it.question.trim(), sort_order: idx })));
    if (itemsError) return alert(itemsError.message);

    if (selectedClauseIds.length > 0) {
      const { error: clauseError } = await supabase
        .from("iso_checklist_template_clauses")
        .insert(selectedClauseIds.map((clause_id) => ({ checklist_template_id: checklist.id, clause_id })));
      if (clauseError) return alert(clauseError.message);
    }

    setNewChecklist({ title: "", description: "" });
    setNewItems([blankItem()]);
    setSelectedClauseIds([]);
    setPickerStandardId("");
    load();
  }

  async function deleteChecklist(id) {
    if (!confirm("Delete this checklist template? Audits already run from it are unaffected.")) return;
    const { error } = await supabase.from("iso_checklist_templates").delete().eq("id", id);
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
        <h1 className="text-xl font-semibold text-slate-800 mb-1">ISO Excellence — checklist library</h1>
        <p className="text-sm text-slate-500">Reusable audit checklists, tagged to clauses across one or more standards. Run against any client to start an audit.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {checklists.length === 0 && <p className="text-sm text-slate-400">No checklists yet.</p>}
            {checklists.map((c) => {
              const tags = (c.iso_checklist_template_clauses || []).map((tc) => tc.clause).filter(Boolean);
              const items = [...(c.iso_checklist_items || [])].sort((a, b) => a.sort_order - b.sort_order);
              return (
                <div key={c.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.title}</p>
                      {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                    </div>
                    <button onClick={() => deleteChecklist(c.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete checklist">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((cl) => (
                        <span key={cl.id} className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
                          {cl.standard?.code} · {cl.clause_reference}
                        </span>
                      ))}
                    </div>
                  )}
                  <ul className="mt-2 text-xs text-slate-600 list-disc list-inside space-y-0.5">
                    {items.map((it) => (
                      <li key={it.id}>{it.question}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <form onSubmit={addChecklist} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Add a checklist</h2>
            <input
              placeholder="Title, e.g. Internal Audit — Clause 8"
              value={newChecklist.title}
              onChange={(e) => setNewChecklist((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Description (optional)"
              value={newChecklist.description}
              onChange={(e) => setNewChecklist((p) => ({ ...p, description: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Checklist items</label>
              {newItems.map((it, idx) => (
                <div key={it.key} className="flex items-center gap-1.5">
                  <input
                    value={it.question}
                    onChange={(e) => updateItem(it.key, e.target.value)}
                    placeholder={`Question ${idx + 1}`}
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <button type="button" onClick={() => removeItemRow(it.key)} className="text-slate-400 hover:text-rose-500 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addItemRow} className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800">
                <Plus size={12} /> Add item
              </button>
            </div>

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
              Add checklist
            </button>
          </form>
        </>
      )}
    </main>
  );
}
