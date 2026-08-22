"use client";
import { useState, useEffect } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function ApprovalsPage() {
  const { isSuperAdmin, canApproveUsers, memberships } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (canApproveUsers) loadRequests();
  }, [canApproveUsers]);

  async function loadRequests() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("site_memberships")
      .select(`
        id, role, status, created_at, site_id, company_id,
        users!user_id(full_name, email),
        sites(name),
        companies(name),
        site_membership_inductions(
          id, trade, experience_level, role_type, declarations_accepted, video_watched_at,
          signature_path, status, reviewer_notes, reviewed_at,
          qualification_uploads(id, file_path, qualification_card_types(label, qualification_schemes(name)))
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (err) setError(err.message);
    const normalized = (data || []).map((r) => ({
      ...r,
      induction: Array.isArray(r.site_membership_inductions) ? r.site_membership_inductions[0] : r.site_membership_inductions,
    }));
    const withSignedUrls = await Promise.all(
      normalized.map(async (r) => {
        if (!r.induction) return r;
        const signatureSignedUrl = await resolveSignedUrl(r.induction.signature_path);
        const qualification_uploads = await Promise.all(
          (r.induction.qualification_uploads || []).map(async (q) => ({ ...q, signedUrl: await resolveSignedUrl(q.file_path) }))
        );
        return { ...r, induction: { ...r.induction, signatureSignedUrl, qualification_uploads } };
      })
    );
    setRequests(withSignedUrls);
    setLoading(false);
  }

  async function resolveSignedUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("personal-documents").createSignedUrl(path, 300);
    if (error) return null;
    return data?.signedUrl || null;
  }

  // A site_manager sees every request for their site; a company_manager
  // only sees requests for their own company on that site — matches the
  // separation already enforced elsewhere in the app.
  const visibleRequests = isSuperAdmin
    ? requests
    : requests.filter((r) =>
        memberships.some(
          (m) =>
            m.site_id === r.site_id &&
            (m.role === "site_manager" || (m.role === "company_manager" && m.company_id === r.company_id))
        )
      );

  async function getReviewerId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id;
  }

  async function handleApprove(request) {
    const reviewerId = await getReviewerId();
    if (request.induction) {
      await supabase
        .from("site_membership_inductions")
        .update({ status: "approved", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
        .eq("id", request.induction.id);
    }
    const { error: err } = await supabase
      .from("site_memberships")
      .update({ status: "approved", approved_by: reviewerId, approved_at: new Date().toISOString() })
      .eq("id", request.id);
    if (err) return setError(err.message);
    loadRequests();
  }

  async function handleReject(request) {
    const notes = prompt("Reason for rejecting (optional, the applicant will see this)?") || null;
    const reviewerId = await getReviewerId();
    if (request.induction) {
      await supabase
        .from("site_membership_inductions")
        .update({ status: "rejected", reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_notes: notes })
        .eq("id", request.induction.id);
    }
    const { error: err } = await supabase
      .from("site_memberships")
      .update({ status: "rejected", approved_by: reviewerId, approved_at: new Date().toISOString() })
      .eq("id", request.id);
    if (err) return setError(err.message);
    loadRequests();
  }

  async function handleNeedsMoreInfo(request) {
    if (!request.induction) return;
    const notes = prompt("What additional information does the applicant need to provide?");
    if (!notes) return; // don't leave the applicant with no idea what to fix
    const reviewerId = await getReviewerId();
    const { error: err } = await supabase
      .from("site_membership_inductions")
      .update({ status: "needs_more_info", reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reviewer_notes: notes })
      .eq("id", request.induction.id);
    if (err) return setError(err.message);
    loadRequests();
  }

  if (!canApproveUsers) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to managers and Super Admins.</main>;
  }

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <h1 className="text-base font-semibold text-slate-800">Pending approvals</h1>
      </div>
      <main className="p-6 max-w-3xl mx-auto">
        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {!loading && visibleRequests.length === 0 && (
          <p className="text-sm text-slate-500">No pending requests right now.</p>
        )}
        <div className="space-y-3">
          {visibleRequests.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.users?.full_name || r.users?.email}</p>
                  <p className="text-xs text-slate-500">
                    Requesting access to {r.sites?.name}
                    {r.companies?.name ? ` · ${r.companies.name}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(r)} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                    <Check size={14} /> Approve
                  </button>
                  {r.induction && (
                    <button onClick={() => handleNeedsMoreInfo(r)} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50">
                      <HelpCircle size={14} /> Needs info
                    </button>
                  )}
                  <button onClick={() => handleReject(r)} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>

              {r.induction ? (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-2">
                  <p>
                    <strong>Trade:</strong> {r.induction.trade || "—"} ({r.induction.experience_level || "—"}) ·{" "}
                    <strong>Role:</strong> {r.induction.role_type || "—"}
                  </p>
                  <p>
                    <strong>Video watched:</strong> {r.induction.video_watched_at ? "Yes" : "No"} ·{" "}
                    <strong>Declarations signed:</strong> {r.induction.declarations_accepted ? "Yes" : "No"}
                  </p>
                  {r.induction.signatureSignedUrl && (
                    <div>
                      <p className="font-medium mb-1">Signature</p>
                      <img src={r.induction.signatureSignedUrl} alt="Applicant signature" className="border border-slate-200 rounded bg-white h-16" />
                    </div>
                  )}
                  {(r.induction.qualification_uploads || []).map((q) => (
                    <div key={q.id}>
                      <p>
                        <strong>Card presented:</strong>{" "}
                        {q.qualification_card_types ? `${q.qualification_card_types.qualification_schemes?.name} ${q.qualification_card_types.label}` : "Unspecified"}
                      </p>
                      {q.signedUrl ? (
                        <a href={q.signedUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                          View uploaded card photo
                        </a>
                      ) : (
                        <span className="text-slate-400">Photo unavailable</span>
                      )}
                    </div>
                  ))}
                  {r.induction.reviewer_notes && (
                    <p className="text-amber-700">
                      <strong>Previous reviewer note:</strong> {r.induction.reviewer_notes}
                    </p>
                  )}
                  <p>
                    <strong>Induction status:</strong> {r.induction.status}
                  </p>
                </div>
              ) : (
                <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  No induction submitted — this is a plain access request.
                </p>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
