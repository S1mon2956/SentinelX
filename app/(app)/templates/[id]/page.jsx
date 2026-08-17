"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ANSWER_TYPES, FAILURE_WORKFLOWS, OPTION_COLORS } from "@/lib/templateConstants";

function blankItem() {
  return {
    key: crypto.randomUUID(),
    id: null,
    question: "",
    answer_type: "pass_fail_na",
    category_tag: "",
    weight: 1,
    failure_workflow: "none",
    options: [],
  };
}

export default function TemplateDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [currentVersion, setCurrentVersion] = useState(1);
  const [items, setItems] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const { data: template } = await supabase
      .from("templates")
      .select("id, name, category, current_version")
      .eq("id", id)
      .single();

    const { data: templateItems } = await supabase
      .from("template_items")
      .select("id, question, answer_type, category_tag, weight, failure_workflow, sort_order, options")
      .eq("template_id", id)
      .order("sort_order");

    if (template) {
      setName(template.name);
      setCategory(template.category || "");
      setCurrentVersion(template.current_version);
    }
    setItems(
      (templateItems || []).map((it) => ({
        key: it.id,
        id: it.id,
        question: it.question,
        answer_type: it.answer_type,
        category_tag: it.category_tag || "",
        weight: it.weight,
        failure_workflow: it.failure_workflow,
        options: it.options || [],
      }))
    );
    setRemovedIds([]);
    setLoading(false);
  }

  function updateItem(key, field, value) {
    setItems((its) => its.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((its) => [...its, blankItem()]);
  }

  function removeItem(key, itemId) {
    setItems((its) => its.filter((it) => it.key !== key));
    if (itemId) setRemovedIds((ids) => [...ids, itemId]);
  }

  function addOption(key) {
    setItems((its) =>
      its.map((it) => (it.key === key ? { ...it, options: [...it.options, { label: "", color: "slate" }] } : it))
    );
  }

  function updateOption(key, idx, field, value) {
    setItems((its) =>
      its.map((it) =>
        it.key === key
          ? { ...it, options: it.options.map((o, i) => (i === idx ? { ...o, [field]: value } : o)) }
          : it
      )
    );
  }

  function removeOption(key, idx) {
    setItems((its) =>
      its.map((it) => (it.key === key ? { ...it, options: it.options.filter((_, i) => i !== idx) } : it))
    );
  }

  async function handleSave() {
    setError("");

    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    const cleanItems = items.filter((it) => it.question.trim());
    if (cleanItems.length === 0) {
      setError("Add at least one checklist item.");
      return;
    }

    setSaving(true);

    const { error: templateError } = await supabase
      .from("templates")
      .update({ name: name.trim(), category: category.trim() || "General" })
      .eq("id", id);
    if (templateError) {
      setSaving(false);
      setError(templateError.message);
      return;
    }

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from("template_items").delete().in("id", removedIds);
      if (deleteError) {
        setSaving(false);
        setError(deleteError.message);
        return;
      }
    }

    const existingRows = cleanItems
      .filter((it) => it.id)
      .map((it, idx) => ({
        id: it.id,
        template_id: id,
        question: it.question.trim(),
        answer_type: it.answer_type,
        category_tag: it.category_tag.trim() || null,
        weight: Number(it.weight) || 1,
        failure_workflow: it.failure_workflow,
        sort_order: idx,
        options:
          it.answer_type === "multiple_choice"
            ? it.options.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), color: o.color }))
            : null,
      }));
    if (existingRows.length > 0) {
      const { error: updateError } = await supabase.from("template_items").upsert(existingRows);
      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return;
      }
    }

    const newRows = cleanItems
      .filter((it) => !it.id)
      .map((it, idx) => ({
        template_id: id,
        question: it.question.trim(),
        answer_type: it.answer_type,
        category_tag: it.category_tag.trim() || null,
        weight: Number(it.weight) || 1,
        failure_workflow: it.failure_workflow,
        sort_order: existingRows.length + idx,
        options:
          it.answer_type === "multiple_choice"
            ? it.options.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), color: o.color }))
            : null,
      }));
    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from("template_items").insert(newRows);
      if (insertError) {
        setSaving(false);
        setError(insertError.message);
        return;
      }
    }

    // Snapshot the new version — inspections keep pointing at older
    // template_versions rows, so past history stays intact even though
    // template_items themselves were just edited in place.
    const nextVersion = currentVersion + 1;
    const { error: versionError } = await supabase.from("template_versions").insert({
      template_id: id,
      version: nextVersion,
      snapshot: { name: name.trim(), category: category.trim() || "General", items: [...existingRows, ...newRows] },
    });
    if (versionError) {
      setSaving(false);
      setError(versionError.message);
      return;
    }

    const { error: bumpError } = await supabase
      .from("templates")
      .update({ current_version: nextVersion })
      .eq("id", id);

    setSaving(false);
    if (bumpError) {
      setError(bumpError.message);
      return;
    }

    router.push("/templates");
  }

  if (loading) {
    return <main className="p-6 max-w-2xl mx-auto text-sm text-slate-500">Loading...</main>;
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-4">Edit template</h1>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 mb-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Template name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Warehouse Safety Walkthrough"
            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Safety, Fleet, Quality"
            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {items.map((it, idx) => (
          <div key={it.key} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <GripVertical size={16} className="text-slate-300 mt-2 shrink-0" />
              <input
                value={it.question}
                onChange={(e) => updateItem(it.key, "question", e.target.value)}
                placeholder={`Checklist item ${idx + 1}`}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => removeItem(it.key, it.id)}
                className="mt-2 text-slate-400 hover:text-rose-500 shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pl-6">
              <div>
                <label className="text-xs text-slate-400">Answer type</label>
                <select
                  value={it.answer_type}
                  onChange={(e) => updateItem(it.key, "answer_type", e.target.value)}
                  className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  {ANSWER_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Category tag</label>
                <input
                  value={it.category_tag}
                  onChange={(e) => updateItem(it.key, "category_tag", e.target.value)}
                  placeholder="e.g. PPE, Fire safety"
                  className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">
                  Weight <span className="text-slate-300">(severity, 1 = normal)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={it.weight}
                  onChange={(e) => updateItem(it.key, "weight", e.target.value)}
                  className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">If this item fails</label>
                <select
                  value={it.failure_workflow}
                  onChange={(e) => updateItem(it.key, "failure_workflow", e.target.value)}
                  className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  {FAILURE_WORKFLOWS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              {it.answer_type === "multiple_choice" && (
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-slate-400">Choices</label>
                  {it.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-1.5">
                      <input
                        value={opt.label}
                        onChange={(e) => updateOption(it.key, oIdx, "label", e.target.value)}
                        placeholder="Choice label"
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <select
                        value={opt.color}
                        onChange={(e) => updateOption(it.key, oIdx, "color", e.target.value)}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                      >
                        {OPTION_COLORS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <button onClick={() => removeOption(it.key, oIdx)} className="text-slate-400 hover:text-rose-500 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(it.key)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"
                  >
                    <Plus size={12} /> Add choice
                  </button>
                  <p className="text-xs text-slate-400">An "N/A" choice (grey) is added automatically.</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-800 mb-4"
      >
        <Plus size={16} /> Add checklist item
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </main>
  );
}
