"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import IsoDisclaimer from "@/components/IsoDisclaimer";

// An org enrolled in exactly one standard skips this picker entirely and
// lands straight on that standard's clause list.
export default function IsoStandardsPickerPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [standards, setStandards] = useState(null);

  useEffect(() => {
    load();
  }, [orgId]);

  async function load() {
    const [{ data: org }, { data: orgStandards }] = await Promise.all([
      supabase.from("iso_organizations").select("name").eq("id", orgId).single(),
      supabase
        .from("iso_organization_standards")
        .select("standard_id, iso_standards(id, code, name, edition)")
        .eq("iso_organization_id", orgId),
    ]);
    setOrgName(org?.name || "");
    setStandards((orgStandards || []).map((r) => r.iso_standards).filter(Boolean));
  }

  useEffect(() => {
    if (standards && standards.length === 1) {
      router.replace(`/iso/${orgId}/standards/${standards[0].id}`);
    }
  }, [standards, orgId, router]);

  if (standards === null || standards.length === 1) {
    return <main className="p-6 text-sm text-slate-500">Loading...</main>;
  }

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
