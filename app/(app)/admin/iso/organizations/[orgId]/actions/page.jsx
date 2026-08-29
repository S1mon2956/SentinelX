"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["open", "in_progress", "closed"];

export default function IsoActionsPage() {
  const { orgId } = useParams();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ title: "", description: "", priority: "medium", owner: "", due_date: "" });
  const [sourceIds, setSourceIds] = useState({ source_audit_id: null, source_audit_answer_id: null });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  useEffect(() => {
    const title = searchParams.get("title");
    const sourceAuditId = searchParams.get("source_audit_id");
    const sourceAnswerId = searchParams.get("source_audit_answer_id");
    if (title) setForm((p) => ({ ...p, title }));
    if (sourceAuditId || sourceAnswerId) {
      setSourceIds({ source_audit_id: sourceAuditId, source_audit_answer_id: sourceAnswerId });
    }
  }, [searchParams]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: actionsData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_actions").select("*").eq("iso_organization_id", orgId).order("created_at", { ascending: false }),
    ]);
    setOrgName(org?.name || "");
    setActions(actionsData || []);
    setLoading(false);
  }

  async function addAction(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { error } = await supabase.from("iso_actions").insert({
      iso_organization_id: orgId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      owner: form.owner.trim() || null,
      due_date: form.due_date || null,
      source_audit_id: sourceIds.source_audit_id || null,
      source_audit_answer_id: sourceIds.source_audit_answer_id || null,
    });
    if (error) return alert(error.message);
    setForm({ title: "", description: "", priority: "medium", owner: "", due_date: "" });
    setSourceIds({ source_audit_id: null, source_audit_answer_id: null });
    load();
  }

  async function updateStatus(id, status) {
    const fields = { status };
    if (status === "closed") fields.closed_at = new Date().toISOString();
    const { error } = await supabase.from("iso_actions").update(fields).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — actions</h1>
        <p className="text-sm text-slate-500">Corrective and preventive actions for this client.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="space-y-2">
            {actions.length === 0 && <p className="text-sm text-slate-400">No actions yet — add one below.</p>}
            {actions.map((a) => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    {a.description && <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      {a.priority} priority{a.owner ? ` · ${a.owner}` : ""}{a.due_date ? ` · due ${a.due_date}` : ""}
                    </p>
                  </div>
                  <select
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs shrink-0"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={addAction} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Add an action</h2>
            {sourceIds.source_audit_answer_id && <p className="text-xs text-indigo-600">Linked to a failed audit item.</p>}
            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                placeholder="Owner"
                value={form.owner}
                onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add action
            </button>
          </form>
        </>
      )}
    </main>
  );
}
