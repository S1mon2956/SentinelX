"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const STATUSES = ["approved", "pending", "suspended"];

export default function IsoContractorsPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", services_provided: "" });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: contractorsData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_contractors").select("*").eq("iso_organization_id", orgId).order("name"),
    ]);
    setOrgName(org?.name || "");
    setContractors(contractorsData || []);
    setLoading(false);
  }

  async function addContractor(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await supabase.from("iso_contractors").insert({
      iso_organization_id: orgId,
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      services_provided: form.services_provided.trim() || null,
    });
    if (error) return alert(error.message);
    setForm({ name: "", contact_name: "", contact_email: "", contact_phone: "", services_provided: "" });
    load();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from("iso_contractors").update({ status }).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — contractors</h1>
        <p className="text-sm text-slate-500">Approved and pending contractors/suppliers for this client.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            {contractors.length === 0 && <p className="text-sm text-slate-400">No contractors yet.</p>}
            {contractors.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.contact_name}
                    {c.contact_name && (c.contact_email || c.contact_phone) ? " · " : ""}
                    {c.contact_email}
                    {c.contact_email && c.contact_phone ? " · " : ""}
                    {c.contact_phone}
                  </p>
                  {c.services_provided && <p className="text-xs text-slate-400">{c.services_provided}</p>}
                </div>
                <select
                  value={c.status}
                  onChange={(e) => updateStatus(c.id, e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs shrink-0"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <form onSubmit={addContractor} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Add a contractor</h2>
            <input
              placeholder="Company name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Contact name"
                value={form.contact_name}
                onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <input
                placeholder="Email"
                value={form.contact_email}
                onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
              <input
                placeholder="Phone"
                value={form.contact_phone}
                onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <input
              placeholder="Services provided"
              value={form.services_provided}
              onChange={(e) => setForm((p) => ({ ...p, services_provided: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add contractor
            </button>
          </form>
        </>
      )}
    </main>
  );
}
