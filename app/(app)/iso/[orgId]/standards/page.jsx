"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import IsoDisclaimer from "@/components/IsoDisclaimer";
import IsoLoading from "@/components/IsoLoading";

// An org enrolled in exactly one standard skips this picker entirely and
// lands straight on that standard's clause list.
export default function IsoStandardsPickerPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [standards, setStandards] = useState(null);
  const [error, setError] = useState("");
  // Set right before the redirect fires, so the render guard doesn't need
  // to re-derive "are we about to leave this page" from `standards` itself.
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    load();
  }, [orgId]);

  async function load() {
    const [{ data: org }, { data: orgStandards, error: standardsError }] = await Promise.all([
      supabase.from("iso_organizations").select("name").eq("id", orgId).single(),
      supabase
        .from("iso_organization_standards")
        .select("standard_id, iso_standards(id, code, name, edition)")
        .eq("iso_organization_id", orgId),
    ]);
    if (standardsError) {
      console.error("Failed to load enrolled standards:", standardsError.message);
      setError(standardsError.message);
      return;
    }
    setOrgName(org?.name || "");
    const resolved = (orgStandards || []).map((r) => r.iso_standards).filter(Boolean);
    if (resolved.length === 1) {
      setRedirecting(true);
      router.replace(`/iso/${orgId}/standards/${resolved[0].id}`);
      return;
    }
    setStandards(resolved);
  }

  if (error) {
    return <main className="p-6 text-sm text-rose-600">Couldn't load standards: {error}</main>;
  }

  if (redirecting || standards === null) return <IsoLoading />;

  if (standards.length === 0) {
    return (
      <main className="p-6 text-sm text-slate-500">
        No standards are enrolled for {orgName || "this organisation"} yet.
      </main>
    );
  }

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{orgName}</h1>
        <p className="text-sm text-slate-500">Choose a standard.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {standards.map((s) => (
          <Link
            key={s.id}
            href={`/iso/${orgId}/standards/${s.id}`}
            className="block border border-slate-200 bg-white rounded-xl p-4 hover:border-slate-300"
          >
            <p className="text-sm font-semibold text-slate-800">ISO {s.code}</p>
            <p className="text-xs text-slate-500">
              {s.name}
              {s.edition ? ` (${s.edition})` : ""}
            </p>
          </Link>
        ))}
      </div>

      <IsoDisclaimer />
    </main>
  );
}
