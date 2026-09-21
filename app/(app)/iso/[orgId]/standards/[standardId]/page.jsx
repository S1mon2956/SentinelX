"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import IsoDisclaimer from "@/components/IsoDisclaimer";
import IsoLoading from "@/components/IsoLoading";

export default function IsoClauseListPage() {
  const { orgId, standardId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [standard, setStandard] = useState(null);
  const [clauses, setClauses] = useState([]);

  useEffect(() => {
    load();
  }, [orgId, standardId]);

  async function load() {
    setLoading(true);
    const [{ data: standardData }, { data: clauseData, error: clausesError }, { data: activeData, error: activeError }] =
      await Promise.all([
        supabase.from("iso_standards").select("*").eq("id", standardId).single(),
        supabase.from("iso_clauses").select("*").eq("standard_id", standardId).order("sort_order"),
        supabase.from("iso_organization_clauses").select("clause_id, is_active").eq("iso_organization_id", orgId),
      ]);
    const loadError = clausesError || activeError;
    if (loadError) {
      console.error("Failed to load clauses:", loadError.message);
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const activeIds = new Set((activeData || []).filter((r) => r.is_active).map((r) => r.clause_id));
    setStandard(standardData || null);
    setClauses((clauseData || []).filter((c) => activeIds.has(c.id)));
    setLoading(false);
  }

  if (loading) return <IsoLoading />;
  if (error) return <main className="p-6 text-sm text-rose-600">Couldn't load clauses: {error}</main>;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">
          ISO {standard?.code}
          {standard?.name ? ` — ${standard.name}` : ""}
        </h1>
        <p className="text-sm text-slate-500">Clauses in scope for your organisation.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {clauses.length === 0 && <p className="p-4 text-sm text-slate-400">No clauses are in scope yet.</p>}
        {clauses.map((c) => (
          <Link
            key={c.id}
            href={`/iso/${orgId}/standards/${standardId}/clauses/${c.id}`}
            className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">
                {c.clause_reference} — {c.title}
              </p>
              {c.description && <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>}
            </div>
          </Link>
        ))}
      </div>

      <IsoDisclaimer />
    </main>
  );
}
