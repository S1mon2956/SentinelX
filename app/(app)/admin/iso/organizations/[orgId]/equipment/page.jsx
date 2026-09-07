"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const STATUSES = ["in_service", "out_of_service", "decommissioned"];

function serviceDateColor(dateStr) {
  if (!dateStr) return "bg-slate-100 text-slate-400";
  const due = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "bg-rose-100 text-rose-700";
  if (diffDays <= 30) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function IsoEquipmentPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [activeOrgClauses, setActiveOrgClauses] = useState([]); // clauses this org has switched on, with standard code attached
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    asset_tag: "",
    category: "",
    location: "",
    owner: "",
    last_service_date: "",
    next_service_date: "",
  });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);

    const [{ data: org }, { data: orgStandardsData }, { data: orgClausesData }, { data: equipmentData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_organization_standards").select("standard:iso_standards(id)").eq("iso_organization_id", orgId),
      supabase.from("iso_organization_clauses").select("*").eq("iso_organization_id", orgId).eq("is_active", true),
      supabase
        .from("iso_equipment")
        .select("*, iso_equipment_clauses(id, clause:iso_clauses(id, clause_reference, title, standard:iso_standards(code)))")
        .eq("iso_organization_id", orgId)
        .order("name"),
    ]);

    const enrolledStandardIds = (orgStandardsData || []).map((s) => s.standard?.id).filter(Boolean);
    const activeClauseIds = (orgClausesData || []).map((oc) => oc.clause_id);
    let activeClauses = [];
    if (enrolledStandardIds.length > 0 && activeClauseIds.length > 0) {
      const { data } = await supabase
        .from("iso_clauses")
        .select("*, standard:iso_standards(code)")
        .in("standard_id", enrolledStandardIds)
        .in("id", activeClauseIds);
      activeClauses = data || [];
    }

    setOrgName(org?.name || "");
    setActiveOrgClauses(activeClauses);
    setEquipment(equipmentData || []);
    setLoading(false);
  }

  async function addEquipment(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await supabase.from("iso_equipment").insert({
      iso_organization_id: orgId,
      name: form.name.trim(),
      asset_tag: form.asset_tag.trim() || null,
      category: form.category.trim() || null,
      location: form.location.trim() || null,
      owner: form.owner.trim() || null,
      last_service_date: form.last_service_date || null,
      next_service_date: form.next_service_date || null,
    });
    if (error) return alert(error.message);
    setForm({ name: "", asset_tag: "", category: "", location: "", owner: "", last_service_date: "", next_service_date: "" });
    load();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from("iso_equipment").update({ status }).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function toggleEquipmentClause(item, clause) {
    const existingLink = (item.iso_equipment_clauses || []).find((ec) => ec.clause?.id === clause.id);
    if (existingLink) {
      const { error } = await supabase.from("iso_equipment_clauses").delete().eq("id", existingLink.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("iso_equipment_clauses").insert({ iso_equipment_id: item.id, clause_id: clause.id });
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
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — plant &amp; equipment</h1>
        <p className="text-sm text-slate-500">Equipment register for this client, with service dates and clause tagging.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="space-y-3">
            {equipment.length === 0 && <p className="text-sm text-slate-400">No equipment logged yet — add one below.</p>}
            {equipment.map((item) => {
              const tags = (item.iso_equipment_clauses || []).map((ec) => ec.clause).filter(Boolean);
              return (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {item.name}
                        {item.asset_tag && <span className="text-xs text-slate-400 ml-2">#{item.asset_tag}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.category}
                        {item.category && item.location ? " · " : ""}
                        {item.location}
                      </p>
                      {item.next_service_date && (
                        <span className={`inline-block mt-1 text-xs font-medium rounded-full px-2 py-0.5 ${serviceDateColor(item.next_service_date)}`}>
                          Next service {item.next_service_date}
                        </span>
                      )}
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
                        value={item.status}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="text-xs font-medium text-indigo-600 underline"
                      >
                        {expandedId === item.id ? "Close" : "Tags"}
                      </button>
                    </div>
                  </div>

                  {expandedId === item.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-1">Clauses this equipment satisfies</p>
                      {activeOrgClauses.length === 0 && (
                        <p className="text-xs text-slate-400">No active clauses in scope for this client yet.</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {activeOrgClauses.map((c) => {
                          const linked = (item.iso_equipment_clauses || []).some((ec) => ec.clause?.id === c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => toggleEquipmentClause(item, c)}
                              title={c.title}
                              className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                                linked ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {c.standard?.code} · {c.clause_reference}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={addEquipment} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Add equipment</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Asset tag"
                value={form.asset_tag}
                onChange={(e) => setForm((p) => ({ ...p, asset_tag: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Category"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <input
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <input
                placeholder="Owner"
                value={form.owner}
                onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Last service
                <input
                  type="date"
                  value={form.last_service_date}
                  onChange={(e) => setForm((p) => ({ ...p, last_service_date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm mt-1"
                />
              </label>
              <label className="text-xs text-slate-500">
                Next service
                <input
                  type="date"
                  value={form.next_service_date}
                  onChange={(e) => setForm((p) => ({ ...p, next_service_date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm mt-1"
                />
              </label>
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add equipment
            </button>
          </form>
        </>
      )}
    </main>
  );
}
