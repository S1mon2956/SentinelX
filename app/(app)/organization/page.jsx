"use client";

import { useEffect, useState } from "react";
import { Plus, X, Building2, MapPin, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function OrganizationPage() {
  const { isSuperAdmin } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [siteCompanies, setSiteCompanies] = useState([]); // { site_id, company_id }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newClientName, setNewClientName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteClientId, setNewSiteClientId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyInternal, setNewCompanyInternal] = useState(false);
  const [siteCompanyPick, setSiteCompanyPick] = useState({}); // site_id -> company_id being selected

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: orgs } = await supabase.from("organizations").select("id, name").limit(1);
    const org = orgs?.[0] || null;
    setOrganization(org);

    if (org) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, name")
        .eq("organization_id", org.id)
        .is("archived_at", null)
        .order("name");
      setClients(clientRows || []);
    }

    const { data: siteRows } = await supabase
      .from("sites")
      .select("id, name, address, client_id, clients(name)")
      .is("archived_at", null)
      .order("name");
    setSites(siteRows || []);

    const { data: companyRows } = await supabase
      .from("companies")
      .select("id, name, is_internal")
      .order("name");
    setCompanies(companyRows || []);

    const { data: scRows } = await supabase.from("site_companies").select("site_id, company_id");
    setSiteCompanies(scRows || []);

    setLoading(false);
  }

  async function addClient() {
    setError("");
    if (!newClientName.trim() || !organization) return;
    const { error: err } = await supabase
      .from("clients")
      .insert({ organization_id: organization.id, name: newClientName.trim() });
    if (err) {
      setError(err.message);
      return;
    }
    setNewClientName("");
    load();
  }

  async function addSite() {
    setError("");
    if (!newSiteName.trim() || !newSiteClientId) {
      setError("A site needs a name and a client.");
      return;
    }
    const { error: err } = await supabase.from("sites").insert({
      name: newSiteName.trim(),
      address: newSiteAddress.trim() || null,
      client_id: newSiteClientId,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setNewSiteName("");
    setNewSiteAddress("");
    setNewSiteClientId("");
    load();
  }

  async function addCompany() {
    setError("");
    if (!newCompanyName.trim()) return;
    const { error: err } = await supabase
      .from("companies")
      .insert({ name: newCompanyName.trim(), is_internal: newCompanyInternal });
    if (err) {
      setError(err.message);
      return;
    }
    setNewCompanyName("");
    setNewCompanyInternal(false);
    load();
  }

  async function assignCompanyToSite(siteId) {
    const companyId = siteCompanyPick[siteId];
    if (!companyId) return;
    const { error: err } = await supabase.from("site_companies").insert({ site_id: siteId, company_id: companyId });
    if (err) {
      setError(err.message);
      return;
    }
    setSiteCompanyPick((p) => ({ ...p, [siteId]: "" }));
    load();
  }

  async function removeCompanyFromSite(siteId, companyId) {
    await supabase.from("site_companies").delete().eq("site_id", siteId).eq("company_id", companyId);
    load();
  }

  if (loading) {
    return <main className="p-6 max-w-4xl mx-auto text-sm text-slate-500">Loading...</main>;
  }

  if (!isSuperAdmin) {
    return (
      <main className="p-6 max-w-4xl mx-auto text-sm text-slate-500">
        This page is only available to Super Admins.
      </main>
    );
  }

  if (!organization) {
    return (
      <main className="p-6 max-w-4xl mx-auto text-sm text-slate-500">
        No organisation found — create one in the Supabase SQL editor first (insert into the{" "}
        <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">organizations</code> table).
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Organisation</h1>
        <p className="text-sm text-slate-500">{organization.name}</p>
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Clients */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Clients</h2>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Client name"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={addClient}
            className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {clients.length === 0 && <p className="text-xs text-slate-400">No clients yet.</p>}
        <ul className="space-y-1">
          {clients.map((c) => (
            <li key={c.id} className="text-sm text-slate-700 px-2 py-1">
              {c.name}
            </li>
          ))}
        </ul>
      </section>

      {/* Sites */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Sites</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          <input
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            placeholder="Site name"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={newSiteAddress}
            onChange={(e) => setNewSiteAddress(e.target.value)}
            placeholder="Address (optional)"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={newSiteClientId}
            onChange={(e) => setNewSiteClientId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={addSite}
          className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 mb-3"
        >
          <Plus size={14} /> Add site
        </button>

        {sites.length === 0 && <p className="text-xs text-slate-400">No sites yet.</p>}
        <div className="space-y-3">
          {sites.map((s) => {
            const assigned = siteCompanies.filter((sc) => sc.site_id === s.id);
            const availableCompanies = companies.filter(
              (co) => !assigned.some((a) => a.company_id === co.id)
            );
            return (
              <div key={s.id} className="border border-slate-100 rounded-lg p-3">
                <p className="text-sm font-medium text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-500 mb-2">
                  {s.clients?.name}{s.address ? ` · ${s.address}` : ""}
                </p>

                <div className="flex flex-wrap gap-1 mb-2">
                  {assigned.map((a) => {
                    const co = companies.find((c) => c.id === a.company_id);
                    return (
                      <span
                        key={a.company_id}
                        className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full"
                      >
                        {co?.name || "Unknown"}
                        <button onClick={() => removeCompanyFromSite(s.id, a.company_id)} className="hover:text-rose-600">
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                  {assigned.length === 0 && <span className="text-xs text-slate-400">No companies assigned.</span>}
                </div>

                {availableCompanies.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={siteCompanyPick[s.id] || ""}
                      onChange={(e) => setSiteCompanyPick((p) => ({ ...p, [s.id]: e.target.value }))}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="">Add a company...</option>
                      {availableCompanies.map((co) => (
                        <option key={co.id} value={co.id}>{co.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignCompanyToSite(s.id)}
                      className="text-xs font-medium px-2 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      Assign
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Companies */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Companies</h2>
        </div>

        <div className="flex gap-2 mb-3 items-center">
          <input
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            placeholder="Company name"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={newCompanyInternal}
              onChange={(e) => setNewCompanyInternal(e.target.checked)}
            />
            Internal (client's own staff)
          </label>
          <button
            onClick={addCompany}
            className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {companies.length === 0 && <p className="text-xs text-slate-400">No companies yet.</p>}
        <ul className="space-y-1">
          {companies.map((c) => (
            <li key={c.id} className="text-sm text-slate-700 px-2 py-1 flex items-center gap-2">
              {c.name}
              {c.is_internal && (
                <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">Internal</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
