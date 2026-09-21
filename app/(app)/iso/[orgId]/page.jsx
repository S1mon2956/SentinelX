"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoDisclaimer from "@/components/IsoDisclaimer";
import IsoLoading from "@/components/IsoLoading";
import { ISO_SECTION_LABELS, ISO_SECTION_ROUTES } from "@/lib/isoSections";

export default function IsoOrgHomePage() {
  const { orgId } = useParams();
  const router = useRouter();
  const { loading: authLoading, isoMemberships, isSuperAdmin } = useAuth();
  // null = still resolving; redirecting away (super admin / member role)
  // never reaches a non-null state, since the effect replaces the route
  // before setting it.
  const [scopes, setScopes] = useState(null);
  const [scopesError, setScopesError] = useState("");

  const membership = isoMemberships.find((m) => m.iso_organization_id === orgId) || null;
  const orgName = membership?.iso_organizations?.name || "Your organisation";

  useEffect(() => {
    if (authLoading) return;

    if (isSuperAdmin) {
      router.replace(`/admin/iso/organizations/${orgId}`);
      return;
    }

    if (!membership) {
      setScopes([]);
      return;
    }

    // A member has full access to every section — the landing page for that
    // role IS the documents flow today, since that's the only section built.
    if (membership.role === "member") {
      router.replace(ISO_SECTION_ROUTES.documents(orgId));
      return;
    }

    supabase
      .from("iso_membership_scopes")
      .select("section")
      .eq("membership_id", membership.id)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load granted sections:", error.message);
          setScopesError(error.message);
        }
        setScopes((data || []).map((s) => s.section));
      });
  }, [authLoading, membership, isSuperAdmin, orgId, router]);

  if (authLoading || isSuperAdmin || (membership && membership.role === "member") || scopes === null) {
    return <IsoLoading />;
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

      {scopesError && (
        <p className="text-sm text-rose-600">Couldn't load your granted sections: {scopesError}</p>
      )}

      {!scopesError && (
        <div className="grid sm:grid-cols-2 gap-3">
          {scopes.length === 0 && <p className="text-sm text-slate-400">No sections have been granted yet.</p>}
          {scopes.map((section) => {
            const routeFor = ISO_SECTION_ROUTES[section];
            const label = ISO_SECTION_LABELS[section] || section;
            const card = (
              <div
                className={`border rounded-xl p-4 ${
                  routeFor ? "border-slate-200 bg-white hover:border-slate-300" : "border-slate-100 bg-slate-50 opacity-60"
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                {!routeFor && <p className="text-xs text-slate-400 mt-1">Coming soon</p>}
              </div>
            );
            return routeFor ? (
              <Link key={section} href={routeFor(orgId)}>
                {card}
              </Link>
            ) : (
              <div key={section}>{card}</div>
            );
          })}
        </div>
      )}

      <IsoDisclaimer />
    </main>
  );
}
