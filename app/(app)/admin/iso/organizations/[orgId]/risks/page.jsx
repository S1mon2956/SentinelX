"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const LEVELS = [1, 2, 3, 4, 5];
const STATUSES = ["open", "mitigated", "closed"];

function scoreColor(score) {
  if (score >= 15) return "bg-rose-100 text-rose-700";
  if (score >= 8) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function IsoRisksPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "", category: "", likelihood: 1, impact: 1, owner: "", review_date: "" });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: risksData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_risks").select("*").eq("iso_organization_id", orgId).order("risk_score", { ascending: false }),
    ]);
    setOrgName(org?.name || "");
    setRisks(risksData || []);
    setLoading(false);
  }

  async function addRisk(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { error } = await supabase.from("iso_risks").insert({
      iso_organization_id: orgId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      likelihood: Number(form.likelihood),
      impact: Number(form.impact),
      owner: form.owner.trim() || null,
      review_date: form.review_date || null,
    });
    if (error) return alert(error.message);
    setForm({ title: "", description: "", category: "", likelihood: 1, impact: 1, owner: "", review_date: "" });
    load();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from("iso_risks").update({ status }).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — risk register</h1>
        <p className="text-sm text-slate-500">Identified risks for this client, sorted highest score first.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Risk</th>
                  <th className="text-center px-3 py-2">Likelihood</th>
                  <th className="text-center px-3 py-2">Impact</th>
                  <th className="text-center px-3 py-2">Score</th>
                  <th className="text-center px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {risks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-slate-400">No risks logged yet.</td>
                  </tr>
                )}
                {risks.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.title}</p>
                      {r.category && <p className="text-xs text-slate-400">{r.category}</p>}
                    </td>
                    <td className="px-3 py-3 text-center">{r.likelihood}</td>
                    <td className="px-3 py-3 text-center">{r.impact}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block min-w-[32px] px-2 py-1 rounded-full font-semibold ${scoreColor(r.risk_score)}`}>
                        {r.risk_score}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value)}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={addRisk} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Add a risk</h2>
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
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-4 gap-2">
              <input
                placeholder="Category"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <select
                value={form.likelihood}
                onChange={(e) => setForm((p) => ({ ...p, likelihood: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>Likelihood {l}</option>
                ))}
              </select>
              <select
                value={form.impact}
                onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>Impact {l}</option>
                ))}
              </select>
              <input
                type="date"
                value={form.review_date}
                onChange={(e) => setForm((p) => ({ ...p, review_date: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <input
              placeholder="Owner"
              value={form.owner}
              onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add risk
            </button>
          </form>
        </>
      )}
    </main>
  );
}
