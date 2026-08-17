"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, ClipboardCheck, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { optionColor, NA_OPTION } from "@/lib/templateConstants";
import { notify } from "@/lib/notify";
import { getLocation } from "@/lib/geolocation";
import SignaturePad from "@/components/SignaturePad";

const PASS_FAIL_OPTIONS = [
  { value: "pass", label: "Pass", color: "emerald" },
  { value: "fail", label: "Fail", color: "rose" },
  { value: "na", label: "N/A", color: "slate" },
];

function computeScore(items, answers) {
  let earned = 0;
  let possible = 0;
  items.forEach((it) => {
    const a = answers[it.id];
    if (!a || !a.value) return;
    if (it.answer_type === "pass_fail_na") {
      if (a.value === "na") return;
      possible += it.weight;
      if (a.value === "pass") earned += it.weight;
    } else if (it.answer_type === "rating") {
      const r = Number(a.value);
      if (!r) return;
      possible += it.weight;
      earned += (r / 5) * it.weight;
    }
  });
  if (possible === 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

const SELECT_FIELDS =
  "id, template_id, template_version, site_id, company_id, inspector_id, assigned_reviewer_id, status, score, submitted_at, inspector_signature_url, inspector_signed_at, approver_signature_url, approver_signed_at, reviewed_by, reviewed_at, approved_by, approved_at, templates(name, category), reviewer:users!assigned_reviewer_id(full_name, email)";

export default function RunInspectionPage() {
  const { id } = useParams();
  const { profile, activeMembership, isSuperAdmin } = useAuth();

  const [inspection, setInspection] = useState(null);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [reviewers, setReviewers] = useState([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");

  // Signatures — captured at the two moments that actually matter: the
  // inspector attesting to their submission, and a manager attesting to
  // their final approval. "Mark as reviewed" is a lighter step and doesn't
  // require one.
  const [inspectorSignature, setInspectorSignature] = useState(null);
  const [approverSignature, setApproverSignature] = useState(null);

  // Separation of duties: holding a manager role doesn't let you sign off your
  // own work. Enforced for real by the inspections_separation_of_duties trigger
  // (phase10) — this just keeps the buttons from appearing at all.
  const isOwnInspection = !!profile?.id && profile.id === inspection?.inspector_id;
  const hasManagerRole =
    isSuperAdmin || activeMembership?.role === "site_manager" || activeMembership?.role === "company_manager";
  const canReview = hasManagerRole && !isOwnInspection;

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);

    const { data: insp } = await supabase.from("inspections").select(SELECT_FIELDS).eq("id", id).single();

    if (!insp) {
      setLoading(false);
      return;
    }
    setInspection(insp);
    setSelectedReviewerId(insp.assigned_reviewer_id || "");

    const { data: managers } = await supabase
      .from("site_memberships")
      .select("user_id, users!user_id(full_name, email)")
      .eq("site_id", insp.site_id)
      .eq("status", "approved")
      .in("role", ["site_manager", "company_manager"]);
    // You can't be your own reviewer — see the separation-of-duties trigger.
    setReviewers((managers || []).filter((m) => m.user_id !== insp.inspector_id));

    const { data: templateItems } = await supabase
      .from("template_items")
      .select("id, question, answer_type, category_tag, weight, failure_workflow, sort_order, options")
      .eq("template_id", insp.template_id)
      .order("sort_order");
    setItems(templateItems || []);

    const { data: existingAnswers } = await supabase
      .from("answers")
      .select("id, template_item_id, value, notes, evidence(id, file_url)")
      .eq("inspection_id", id);

    const mapped = {};
    (existingAnswers || []).forEach((a) => {
      mapped[a.template_item_id] = {
        answerId: a.id,
        value: a.value || "",
        notes: a.notes || "",
        photoFile: null,
        evidence: a.evidence || [],
      };
    });
    setAnswers(mapped);

    setLoading(false);
  }

  function updateAnswer(itemId, field, value) {
    setAnswers((prev) => ({
      ...prev,
      [itemId]: { answerId: null, value: "", notes: "", photoFile: null, evidence: [], ...prev[itemId], [field]: value },
    }));
  }

  async function saveOneAnswer(item) {
    const a = answers[item.id];
    if (!a || (!a.value && !a.notes && !a.photoFile)) return null;

    let answerId = a.answerId;
    if (answerId) {
      await supabase.from("answers").update({ value: a.value || null, notes: a.notes || null }).eq("id", answerId);
    } else {
      const { data, error: insertErr } = await supabase
        .from("answers")
        .insert({
          inspection_id: id,
          template_item_id: item.id,
          value: a.value || null,
          notes: a.notes || null,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      answerId = data.id;
    }

    let newEvidence = a.evidence;
    if (a.photoFile) {
      const path = `evidence/${answerId}-${Date.now()}-${a.photoFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, a.photoFile);
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(path);
      const location = a.includeLocation ? await getLocation() : null;
      const { data: evRow, error: evErr } = await supabase
        .from("evidence")
        .insert({
          answer_id: answerId,
          file_url: urlData.publicUrl,
          captured_by: profile?.id,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        })
        .select()
        .single();
      if (evErr) throw evErr;
      newEvidence = [...(a.evidence || []), evRow];
    }

    if (item.answer_type === "pass_fail_na" && a.value === "fail" && item.failure_workflow !== "none") {
      const { data: existingObs } = await supabase
        .from("observations")
        .select("id")
        .eq("answer_id", answerId)
        .maybeSingle();
      if (!existingObs) {
        await supabase.from("observations").insert({
          answer_id: answerId,
          site_id: inspection.site_id,
          company_id: inspection.company_id,
          status: "open",
        });
      }
    }

    setAnswers((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], answerId, photoFile: null, evidence: newEvidence },
    }));

    return answerId;
  }

  // Uploads a signature blob to the evidence bucket and returns its public URL.
  async function uploadSignature(blob, role) {
    const path = `signatures/${id}-${role}-${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, blob);
    if (uploadErr) throw new Error(`Signature upload failed: ${uploadErr.message}`);
    const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleSaveProgress() {
    setError("");
    setSaving(true);
    try {
      for (const item of items) {
        await saveOneAnswer(item);
      }
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function handleSubmit() {
    setError("");
    if (!inspectorSignature) {
      setError("Please sign before submitting — this is your attestation that the inspection is accurate.");
      return;
    }
    setSubmitting(true);
    try {
      for (const item of items) {
        await saveOneAnswer(item);
      }
      const score = computeScore(items, answers);
      const signatureUrl = await uploadSignature(inspectorSignature, "inspector");

      const { data: updated, error: submitErr } = await supabase
        .from("inspections")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          score,
          assigned_reviewer_id: selectedReviewerId || null,
          inspector_signature_url: signatureUrl,
          inspector_signed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(SELECT_FIELDS)
        .single();
      if (submitErr) throw submitErr;
      setInspection(updated);

      if (updated.assigned_reviewer_id) {
        notify({
          userId: updated.assigned_reviewer_id,
          type: "inspection_submitted",
          title: "An inspection needs your review",
          body: `${updated.templates?.name || "An inspection"} was just submitted to you for review.`,
          link: "/inspections/" + id,
        });
      } else {
        const { data: managersToNotify } = await supabase
          .from("site_memberships")
          .select("user_id")
          .eq("site_id", updated.site_id)
          .eq("status", "approved")
          .in("role", ["site_manager", "company_manager"]);
        (managersToNotify || [])
          .filter((r) => r.user_id !== updated.inspector_id)
          .forEach((r) => {
            notify({
              userId: r.user_id,
              type: "inspection_submitted",
              title: "An inspection needs your review",
              body: `${updated.templates?.name || "An inspection"} was just submitted.`,
              link: "/inspections/" + id,
            });
          });
      }
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  }

  async function advanceStatus(newStatus, extraFields = {}) {
    setError("");
    setAdvancing(true);
    const { data: updated, error: err } = await supabase
      .from("inspections")
      .update({ status: newStatus, ...extraFields })
      .eq("id", id)
      .select(SELECT_FIELDS)
      .single();
    setAdvancing(false);
    if (err) {
      setError(err.message);
      return;
    }
    setInspection(updated);

    if (newStatus === "approved") {
      notify({
        userId: updated.inspector_id,
        type: "inspection_approved",
        title: "Your inspection was approved",
        body: `${updated.templates?.name || "Your inspection"} has been approved.`,
        link: "/inspections/" + id,
      });
    }
  }

  async function handleMarkReviewed() {
    await advanceStatus("reviewed", {
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    });
  }

  async function handleApprove() {
    setError("");
    if (!approverSignature) {
      setError("Please sign before approving — this is your sign-off on this inspection.");
      return;
    }
    setAdvancing(true);
    try {
      const signatureUrl = await uploadSignature(approverSignature, "approver");
      await advanceStatus("approved", {
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approver_signature_url: signatureUrl,
        approver_signed_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message);
    }
    setAdvancing(false);
  }

  if (loading) {
    return <main className="p-6 max-w-2xl mx-auto text-sm text-slate-500">Loading...</main>;
  }
  if (!inspection) {
    return <main className="p-6 max-w-2xl mx-auto text-sm text-slate-500">Inspection not found.</main>;
  }

  const isSubmitted = inspection.status !== "draft";

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-800">{inspection.templates?.name}</h1>
        {isSubmitted && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              inspection.status === "approved"
                ? "bg-emerald-100 text-emerald-700"
                : inspection.status === "reviewed"
                ? "bg-sky-100 text-sky-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            <CheckCircle2 size={12} /> {inspection.status}
            {inspection.score != null ? ` · ${inspection.score}%` : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {inspection.templates?.category || "General"} · v{inspection.template_version}
      </p>

      {hasManagerRole && isOwnInspection && (inspection.status === "submitted" || inspection.status === "reviewed") && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-slate-600 flex items-center gap-1">
            <ClipboardCheck size={15} /> This is your own inspection — another manager needs to sign it off.
          </p>
        </div>
      )}

      {canReview && inspection.status === "submitted" && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-sky-800 flex items-center gap-1">
            <ClipboardCheck size={15} /> Awaiting your review
          </p>
          <button
            onClick={handleMarkReviewed}
            disabled={advancing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {advancing ? "Saving..." : "Mark as reviewed"}
          </button>
        </div>
      )}

      {canReview && inspection.status === "reviewed" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-emerald-800 flex items-center gap-1 mb-2">
            <ClipboardCheck size={15} /> Reviewed — sign to give final approval
          </p>
          <div className="mb-2">
            <SignaturePad onChange={setApproverSignature} />
          </div>
          <button
            onClick={handleApprove}
            disabled={advancing || !approverSignature}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {advancing ? "Saving..." : "Approve inspection"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item) => {
          const a = answers[item.id] || { value: "", notes: "", evidence: [] };
          const mcOptions = item.options?.length > 0 ? [...item.options, NA_OPTION] : [];
          const coloredAnswer =
            item.answer_type === "multiple_choice" && mcOptions.length > 0 && a.value
              ? { label: a.value, color: mcOptions.find((o) => o.label === a.value)?.color }
              : item.answer_type === "pass_fail_na" && a.value
              ? PASS_FAIL_OPTIONS.find((o) => o.value === a.value)
              : null;
          return (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-800 mb-2">{item.question}</p>

              {!isSubmitted && item.answer_type === "pass_fail_na" && (
                <div className="flex gap-2 mb-2">
                  {PASS_FAIL_OPTIONS.map((opt) => {
                    const c = optionColor(opt.color);
                    const selected = a.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateAnswer(item.id, "value", opt.value)}
                        className={`flex-1 min-h-[52px] text-base font-semibold px-4 rounded-xl border-2 active:scale-95 transition ${
                          selected ? `text-white ${c.selected} border-transparent` : "border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {!isSubmitted && item.answer_type === "rating" && (
                <div className="flex gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateAnswer(item.id, "value", String(n))}
                      className={`flex-1 min-h-[52px] text-base font-semibold rounded-xl border-2 active:scale-95 transition ${
                        a.value === String(n)
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {!isSubmitted && item.answer_type === "multiple_choice" && mcOptions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {mcOptions.map((opt) => {
                    const c = optionColor(opt.color);
                    const selected = a.value === opt.label;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => updateAnswer(item.id, "value", opt.label)}
                        className={`min-h-[48px] text-sm font-semibold px-4 rounded-xl border-2 active:scale-95 transition ${
                          selected ? `text-white ${c.selected} border-transparent` : "border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {!isSubmitted &&
                (item.answer_type === "free_text" || (item.answer_type === "multiple_choice" && mcOptions.length === 0)) && (
                  <input
                    value={a.value}
                    onChange={(e) => updateAnswer(item.id, "value", e.target.value)}
                    placeholder={item.answer_type === "multiple_choice" ? "Answer (no choices configured)" : "Answer"}
                    className="w-full mb-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}

              {isSubmitted && coloredAnswer && (
                <span
                  className={`inline-block text-xs font-medium px-2 py-1 rounded-full text-white mb-2 ${
                    optionColor(coloredAnswer.color).selected
                  }`}
                >
                  {coloredAnswer.label}
                </span>
              )}
              {isSubmitted && !coloredAnswer && (
                <p className="text-sm text-slate-600 mb-2">{a.value || "—"}</p>
              )}

              {!isSubmitted && (
                <textarea
                  placeholder="Notes (optional)"
                  value={a.notes}
                  onChange={(e) => updateAnswer(item.id, "notes", e.target.value)}
                  rows={2}
                  className="w-full mb-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              )}
              {isSubmitted && a.notes && <p className="text-xs text-slate-500 mb-2">{a.notes}</p>}

              {!isSubmitted && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
                    <Camera size={14} />
                    {a.photoFile ? a.photoFile.name : "Attach photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => updateAnswer(item.id, "photoFile", e.target.files?.[0] || null)}
                    />
                  </label>
                  {a.photoFile && (
                    <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={!!a.includeLocation}
                        onChange={(e) => updateAnswer(item.id, "includeLocation", e.target.checked)}
                      />
                      <MapPin size={13} /> Include location
                    </label>
                  )}
                </div>
              )}

              {a.evidence?.length > 0 && (
                <div className="flex gap-2 mt-1">
                  {a.evidence.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-amber-700 hover:underline"
                    >
                      View photo
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isSubmitted && reviewers.length > 0 && (
        <div className="mb-3">
          <label className="text-xs text-slate-400">Reviewer (optional)</label>
          <select
            value={selectedReviewerId}
            onChange={(e) => setSelectedReviewerId(e.target.value)}
            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">No one in particular — notify all managers</option>
            {reviewers.map((r) => (
              <option key={r.user_id} value={r.user_id}>
                {r.users?.full_name || r.users?.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {isSubmitted && inspection.reviewer && (
        <p className="text-xs text-slate-500 mb-3">
          Reviewer: {inspection.reviewer.full_name || inspection.reviewer.email}
        </p>
      )}

      {isSubmitted && inspection.inspector_signature_url && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Inspector's signature</p>
          <img src={inspection.inspector_signature_url} alt="Inspector signature" className="border border-slate-200 rounded-lg h-16" />
        </div>
      )}

      {isSubmitted && inspection.approver_signature_url && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Approver's signature</p>
          <img src={inspection.approver_signature_url} alt="Approver signature" className="border border-slate-200 rounded-lg h-16" />
        </div>
      )}

      {!isSubmitted && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Your signature (required to submit)</p>
          <SignaturePad onChange={setInspectorSignature} />
        </div>
      )}

      {!isSubmitted && (
        <div className="flex gap-2">
          <button
            onClick={handleSaveProgress}
            disabled={saving || submitting}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save progress"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting || !inspectorSignature}
            className="flex-1 bg-slate-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit inspection"}
          </button>
        </div>
      )}
    </main>
  );
}
