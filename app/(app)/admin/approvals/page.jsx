"use client";

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// This page should be restricted to super_admin, site_manager, and
// company_manager roles at the route level once auth guards are added.
// A site_manager/company_manager should only see requests for their own
// site/company — that filter is noted below where the query happens.
export default function ApprovalsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError("");
    // TODO: filter to `site_id in (sites this manager oversees)` once
    // the logged-in user's own memberships are loaded — for a super_admin
    // this filter is skipped entirely.
    //
    // users(...) is disambiguated to !user_id because site_memberships has
    // two foreign keys to users (user_id and approved_by) — without the
    // hint, PostgREST can't tell which relationship is meant and errors.
    const { data, error: err } = await supabase
      .from("site_memberships")
      .select("id, role, status, created_at, users!user_id(full_name, email), sites(name), companies(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (err) {
      setError(err.message);
    }
    setRequests(data || []);
    setLoading(false);
  }

  async function handleDecision(id, decision) {
    const { data: userData } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("site_memberships")
      .update({
        status: decision,
        approved_by: userData?.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    loadRequests();
  }

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <h1 className="text-base font-semibold text-slate-800">Pending approvals</h1>
      </div>

      <main className="p-6 max-w-3xl mx-auto">
        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-slate-500">Loading...</p>}

        {!loading && requests.length === 0 && (
          <p className="text-sm text-slate-500">No pending requests right now.</p>
        )}

        <div className="space-y-2">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {r.users?.full_name || r.users?.email}
                </p>
                <p className="text-xs text-slate-500">
                  Requesting access to {r.sites?.name}
                  {r.companies?.name ? ` · ${r.companies.name}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecision(r.id, "approved")}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  onClick={() => handleDecision(r.id, "rejected")}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
