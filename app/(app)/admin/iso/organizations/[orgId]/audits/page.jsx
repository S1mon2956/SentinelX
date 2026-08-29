"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const AUDIT_STATUSES = ["draft", "in_progress", "completed"];
const RESULTS = ["pending", "pass", "fail", "na"];

export default function IsoAuditsPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [checklists, setChecklists] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChecklistId, setSelectedChecklistId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: checklistData }, { data: auditsData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_checklist_templates").select("*, iso_checklist_items(id, question, sort_order)").order("title"),
      supabase
        .from("iso_audits")
        .select("*, iso_audit_answers(*)")
        .eq("iso_organization_id", orgId)
        .order("created_at", { ascending: false }),
    ]);
    setOrgName(org?.name || "");
    setChecklists(checklistData || []);
    setAudits(auditsData || []);
    setLoading(false);
  }

  async function startAudit(e) {
    e.preventDefault();
    const checklist = checklists.find((c) => c.id === selectedChecklistId);
    if (!checklist) return;
    const { data: audit, error } = await supabase
      .from("iso_audits")
      .insert({
        iso_organization_id: orgId,
        checklist_template_id: checklist.id,
        title: newTitle.trim() || checklist.title,
        status: "draft",
      })
      .select()
      .single();
    if (error) return alert(error.message);

    const items = [...(checklist.iso_checklist_items || [])].sort((a, b) => a.sort_order - b.sort_order);
    if (items.length > 0) {
      const { error: answersError } = await supabase
        .from("iso_audit_answers")
        .insert(items.map((it) => ({ iso_audit_id: audit.id, checklist_item_id: it.id, question: it.question, result: "pending" })));
      if (answersError) return alert(answersError.message);
    }

    setSelectedChecklistId("");
    setNewTitle("");
    load();
  }

  async function updateAuditStatus(auditId, status) {
    const { error } = await supabase.from("iso_audits").update({ status }).eq("id", auditId);
    if (error) return alert(error.message);
    load();
  }

  async function updateAnswer(answerId, fields) {
    const { error } = await supabase.from("iso_audit_answers").update(fields).eq("id", answerId);
    if (error) return alert(error.message);
    load();
  }

  function raiseAction(audit, answer) {
    const params = new URLSearchParams({
      source_audit_id: audit.id,
      source_audit_answer_id: answer.id,
      title: `Address: ${answer.question}`,
    });
    router.push(`/admin/iso/organizations/${orgId}/actions?${params.toString()}`);
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — audits</h1>
        <p className="text-sm text-slate-500">Audit runs against this client's checklists.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="space-y-3">
            {audits.length === 0 && <p className="text-sm text-slate-400">No audits yet — start one below.</p>}
            {audits.map((a) => {
              const answers = [...(a.iso_audit_answers || [])];
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={a.status}
                        onChange={(e) => updateAuditStatus(a.id, e.target.value)}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {AUDIT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                        className="text-xs font-medium text-indigo-600 underline"
                      >
                        {expandedId === a.id ? "Close" : "Open"}
                      </button>
                    </div>
                  </div>

                  {expandedId === a.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      {answers.length === 0 && <p className="text-xs text-slate-400">No items on this audit.</p>}
                      {answers.map((ans) => (
                        <div key={ans.id} className="border border-slate-100 rounded-lg p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-slate-700 flex-1">{ans.question}</p>
                            <select
                              value={ans.result}
                              onChange={(e) => updateAnswer(ans.id, { result: e.target.value })}
                              className="border border-slate-300 rounded-lg px-2 py-1 text-xs shrink-0"
                            >
                              {RESULTS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              key={ans.id + (ans.notes || "")}
                              defaultValue={ans.notes || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (ans.notes || "")) updateAnswer(ans.id, { notes: e.target.value });
                              }}
                              placeholder="Notes"
                              className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs"
                            />
                            {ans.result === "fail" && (
                              <button onClick={() => raiseAction(a, ans)} className="text-xs font-medium text-rose-600 underline shrink-0">
                                Raise action
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={startAudit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Start an audit</h2>
            <select
              value={selectedChecklistId}
              onChange={(e) => setSelectedChecklistId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Choose a checklist...</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <input
              placeholder="Audit title (optional, defaults to checklist title)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Start audit
            </button>
          </form>
        </>
      )}
    </main>
  );
}
