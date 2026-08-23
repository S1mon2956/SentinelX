"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function SiteReviewersPage() {
  const { siteId } = useParams();
  const { isSuperAdmin, memberships } = useAuth();
  // Deliberately narrower than canManageSite: only a full site manager or a
  // super admin, matching the phase26 INSERT policy exactly — a company
  // manager can't add a site-wide external reviewer.
  const allowed = isSuperAdmin || memberships.some((m) => m.site_id === siteId && m.role === "site_manager");

  const [siteName, setSiteName] = useState("");
  const [reviewers, setReviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (allowed) load();
  }, [allowed, siteId]);

  async function load() {
    setLoading(true);
    const [{ data: site }, { data: reviewerRows }] = await Promise.all([
      supabase.from("sites").select("name").eq("id", siteId).single(),
      supabase
        .from("site_memberships")
        .select("id, users!user_id(full_name, email)")
        .eq("site_id", siteId)
        .eq("role", "external_reviewer")
        .eq("status", "approved"),
    ]);
    setSiteName(site?.name || "");
    setReviewers(reviewerRows || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError("");
    if (!email.trim()) {
      setFormError("Enter the reviewer's email address.");
      return;
    }
    setAdding(true);

    const { data: found, error: lookupErr } = await supabase.rpc("find_user_by_email", {
      target_site_id: siteId,
      target_email: email.trim(),
    });

    if (lookupErr) {
      setAdding(false);
      setFormError(lookupErr.message);
      return;
    }
    if (!found || found.length === 0) {
      setAdding(false);
      setFormError("No account found for that email — ask them to sign up first, then add them here.");
      return;
    }

    const { error: insertErr } = await supabase.from("site_memberships").insert({
      user_id: found[0].user_id,
      site_id: siteId,
      role: "external_reviewer",
      status: "approved",
      company_id: null,
    });

    setAdding(false);
    if (insertErr) {
      // A row-level security rejection here almost always means the person
      // already has some membership on this site (see phase26's not exists
      // check) — that's a manual reconciliation, not something to retry.
      if (insertErr.message?.toLowerCase().includes("row-level security")) {
        setFormError("That person already has access to this site — check their existing role in Approvals, or ask a team member to help reconcile it manually.");
      } else {
        setFormError(insertErr.message);
      }
      return;
    }

    setEmail("");
    load();
  }

  if (!allowed) {
    return <main className="p-6 text-sm text-slate-500">Only a site manager or super admin can manage external reviewers for this site.</main>;
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">External reviewers — {siteName || "..."}</h1>
      <p className="text-sm text-slate-500 mb-6">
        An external reviewer can review and approve inspections on this site without any of the other manager
        permissions — useful when this site only has one manager, who can't sign off their own inspections.
      </p>

      <form onSubmit={handleAdd} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-2">
        {formError && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{formError}</p>
        )}
        <label className="text-xs font-medium text-slate-500">Reviewer's email</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="reviewer@example.com"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50 shrink-0"
          >
            <UserPlus size={16} /> {adding ? "Adding..." : "Add reviewer"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          They need an existing SentinelX account — if they don't have one yet, ask them to sign up first.
        </p>
      </form>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && reviewers.length === 0 && (
        <p className="text-sm text-slate-500">No external reviewers added for this site yet.</p>
      )}
      {!loading && reviewers.length > 0 && (
        <div className="space-y-2">
          {reviewers.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-sm font-medium text-slate-800">{r.users?.full_name || "—"}</p>
              <p className="text-xs text-slate-500">{r.users?.email}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
