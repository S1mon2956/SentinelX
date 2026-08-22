"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function IsoOrganizationsPage() {
  const { isSuperAdmin } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("iso_organizations").select("*").order("name");
    setOrganizations(data || []);
    setLoading(false);
  }

  async function addOrganization(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase.from("iso_organizations").insert({ name: newName.trim() });
    if (error) return alert(error.message);
    setNewName("");
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 mb-1">ISO Excellence</h1>
          <p className="text-sm text-slate-500">Clients you're building or maintaining an ISO management system for.</p>
        </div>
        <Link href="/admin/iso/templates" className="text-sm text-indigo-600 underline shrink-0">
          Manage template library
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            {organizations.length === 0 && <p className="text-sm text-slate-400">No ISO clients yet.</p>}
            {organizations.map((o) => (
              <Link
                key={o.id}
                href={`/admin/iso/organizations/${o.id}`}
                className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0 hover:bg-slate-50 -mx-2 px-2 rounded"
              >
                <span className="text-slate-800 font-medium">{o.name}</span>
                <span className="text-xs text-slate-400 uppercase">ISO {o.standard}</span>
              </Link>
            ))}
          </div>

          <form onSubmit={addOrganization} className="flex gap-2">
            <input
              placeholder="Client name, e.g. Acme Roofing Ltd"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add client
            </button>
          </form>
        </>
      )}
    </main>
  );
}
