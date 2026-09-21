"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import IsoLoading from "@/components/IsoLoading";

// Client-facing ISO Excellence home. Super admins manage clients from
// /admin/iso instead — this route is only reachable by a real client
// membership, so there's no "which org" picker needed today (no
// self-registration, and multi-org client memberships aren't a case that
// exists yet — see phase37).
export default function IsoClientHomePage() {
  const router = useRouter();
  const { loading, isoMemberships, isSuperAdmin } = useAuth();
  const redirecting = loading || isSuperAdmin || isoMemberships.length > 0;

  useEffect(() => {
    if (loading) return;
    if (isSuperAdmin) {
      router.replace("/admin/iso");
      return;
    }
    if (isoMemberships.length > 0) {
      router.replace(`/iso/${isoMemberships[0].iso_organization_id}`);
    }
  }, [loading, isoMemberships, isSuperAdmin, router]);

  if (redirecting) return <IsoLoading />;

  return (
    <main className="p-6 max-w-lg mx-auto text-center space-y-2">
      <h1 className="text-lg font-semibold text-slate-800">No ISO Excellence access</h1>
      <p className="text-sm text-slate-500">
        You don't have an approved membership for an organisation yet. Contact your Sentinel Safety
        contact if you think this is wrong.
      </p>
    </main>
  );
}
