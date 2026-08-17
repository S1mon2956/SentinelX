"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  reviewed: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
};

export default function InspectionsListPage() {
  const { activeSiteId, activeMembership } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("inspections")
      .select("id, status, score, submitted_at, templates(name, category), users:inspector_id(full_name, email)")
      .eq("site_id", activeSiteId)
      .order("submitted_at", { ascending: false, nullsFirst: true });

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      query = query.eq("company_id", activeMembership.company_id);
    }

    const { data } = await query;
    setInspections(data || []);
    setLoading(false);
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  const filtered = filter === "all" ? inspections : inspections.filter((i) => i.status === filter);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Inspections</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted — needs review</option>
          <option value="reviewed">Reviewed — needs approval</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-slate-500">No inspections here.</p>}

      <div className="space-y-2">
        {filtered.map((i) => (
          <Link
            key={i.id}
            href={`/inspections/${i.id}`}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">{i.templates?.name}</p>
              <p className="text-xs text-slate-500">
                {i.users?.full_name || i.users?.email || "Unknown inspector"}
                {i.submitted_at && ` · ${new Date(i.submitted_at).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {i.score != null && <span className="text-sm font-semibold text-slate-700">{i.score}%</span>}
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[i.status]}`}>
                {i.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
