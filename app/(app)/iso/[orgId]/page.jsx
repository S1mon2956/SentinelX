"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoDisclaimer from "@/components/IsoDisclaimer";

// Only "documents" has a built client-facing page so far — every other
// section is real (a restricted user really can be scoped to it) but has
// no destination yet, so it renders as a disabled card rather than a link.
const SECTION_LABELS = {
  documents: "Documents",
  audits: "Audits",
  actions: "Actions",
  risks: "Risks",
  contractors: "Contractors",
  equipment: "Equipment",
  meetings: "Meetings",
  reports: "Audit Reports",
};
const AVAILABLE_SECTIONS = new Set(["documents"]);

export default function IsoOrgHomePage() {
  const { orgId } = useParams();
  const router = useRouter();
  const { loading: authLoading, isoMemberships, isSuperAdmin } = useAuth();
  const [scopes, setScopes] = useState(null);
  const [loadingScopes, setLoadingScopes] = useState(true);

  const membership = isoMemberships.find((m) => m.iso_organization_id === orgId) || null;
  const orgName = membership?.iso_organizations?.name || "Your organisation";

  useEffect(() => {
    if (authLoading) return;

    if (isSuperAdmin) {
      router.replace(`/admin/iso/organizations/${orgId}`);
      return;
    }

    if (!membership) {
      setLoadingScopes(false);
      return;
    }

    // A member has full access to every section — the landing page for that
    // role IS the documents flow today, since that's the only section built.
    if (membership.role === "member") {
      router.replace(`/iso/${orgId}/standards`);
      return;
    }

    supabase
      .from("iso_membership_scopes")
      .select("section")
      .eq("membership_id", membership.id)
      .then(({ data }) => {
        setScopes((data || []).map((s) => s.section));
        setLoadingScopes(false);
      });
  }, [authLoading, membership, isSuperAdmin, orgId, router]);

  if (authLoading || isSuperAdmin || (membership && membership.role === "member")) {
    return <main className="p-6 text-sm text-slate-500">Loading...</main>;
  }

  if (loadingScopes) {
    return <main className="p-6 text-sm text-slate-500">Loading...</main>;
  }

  if (!membership) {
    return (
      <main className="p-6 max-w-lg mx-auto text-center space-y-2">
        <h1 className="text-lg font-semibold text-slate-800">No access</h1>
        <p className="text-sm text-slate-500">You don't have an approved membership for this organisation.</p>
      </main>
    );
  }

  // Only restricted-role users render past this point.
  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{orgName}</h1>
        <p className="text-sm text-slate-500">Sections you've been granted access to.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {(scopes || []).length === 0 && (
          <p className="text-sm text-slate-400">No sections have been granted yet.</p>
        )}
        {(scopes || []).map((section) => {
          const available = AVAILABLE_SECTIONS.has(section);
          const label = SECTION_LABELS[section] || section;
          const card = (
            <div
              className={`border rounded-xl p-4 ${
                available ? "border-slate-200 bg-white hover:border-slate-300" : "border-slate-100 bg-slate-50 opacity-60"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              {!available && <p className="text-xs text-slate-400 mt-1">Coming soon</p>}
            </div>
          );
          return available ? (
            <Link key={section} href={`/iso/${orgId}/standards`}>
              {card}
            </Link>
          ) : (
            <div key={section}>{card}</div>
          );
        })}
      </div>

      <IsoDisclaimer />
    </main>
  );
}
