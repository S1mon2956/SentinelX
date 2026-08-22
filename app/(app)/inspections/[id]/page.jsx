"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, ClipboardCheck, MapPin, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { optionColor, NA_OPTION } from "@/lib/templateConstants";
import { notify } from "@/lib/notify";
import { getLocation } from "@/lib/geolocation";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  queueAnswer,
  getQueuedAnswers,
  removeQueuedAnswer,
  queuePhoto,
  getQueuedPhotos,
  removeQueuedPhoto,
} from "@/lib/offlineQueue";
import SignaturePad from "@/components/SignaturePad";
import VoiceInput from "@/components/VoiceInput";

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

// Evidence/signature columns now store a bare storage path rather than a
// permanent public URL, since the "evidence" bucket is private — a signed,
// time-limited URL has to be resolved on demand for anything we display.
async function resolveSignedUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

async function withSignedSignatures(insp) {
  const [inspectorSignatureUrl, approverSignatureUrl] = await Promise.all([
    resolveSignedUrl(insp.inspector_signature_path),
    resolveSignedUrl(insp.approver_signature_path),
  ]);
  return { ...insp, inspectorSignatureUrl, approverSignatureUrl };
}

const SELECT_FIELDS =
  "id, template_id, template_version, site_id, company_id, inspector_id, assigned_reviewer_id, status, score, submitted_at, inspector_signature_path, inspector_signed_at, approver_signature_path, approver_signed_at, reviewed_by, reviewed_at, approved_by, approved_at, templates(name, category), reviewer:users!assigned_reviewer_id(full_name, email)";

export default function RunInspectionPage() {
  const { id } = useParams();
  const { profile, activeMembership, isSuperAdmin } = useAuth();
  const isOnline = useOnlineStatus();

  const [inspection, setInspection] = useState(null);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quickVoiceLoading, setQuickVoiceLoading] = useState(false);
  const [quickVoiceSuggestion, setQuickVoiceSuggestion] = useState(null);
  const [quickVoiceError, setQuickVoiceError] = useState("");
  const [reviewers, setReviewers] = useState([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");
  const [syncBanner, setSyncBanner] = useState(""); // e.g. "Saved offline — will sync automatically"

  const [inspectorSignature, setInspectorSignature] = useState(null);
  const [approverSignature, setApproverSignature] = useState(null);

  const isOwnInspection = !!profile?.id && profile.id === inspection?.inspector_id;
  const hasManagerRole =
    isSuperAdmin || activeMembership?.role === "site_manager" || activeMembership?.role === "company_manager";
  const canReview = hasManagerRole && !isOwnInspection;

  useEffect(() => {
    load();
  }, [id]);

  // The moment connectivity comes back, automatically try pushing anything
  // that's still queued locally — this is what makes sync feel automatic
  // rather than something the person has to remember to trigger.
  useEffect(() => {
    if (isOnline && !loading) {
      flushQueue();
    }
  }, [isOnline]);

  async function load() {
    setLoading(true);

    const { data: insp } = await supabase.from("inspections").select(SELECT_FIELDS).eq("id", id).single();

    if (!insp) {
      setLoading(false);
      return;
    }
    setInspection(await withSignedSignatures(insp));
    setSelectedReviewerId(insp.assigned_reviewer_id || "");

    const { data: managers } = await supabase
      .from("site_memberships")
      .select("user_id, users!user_id(full_name, email)")
      .eq("site_id", insp.site_id)
      .eq("status", "approved")
      .in("role", ["site_manager", "company_manager"]);
    setReviewers((managers || []).filter((m) => m.user_id !== insp.inspector_id));

    const { data: templateItems } = await supabase
      .from("template_items")
      .select("id, question, answer_type, category_tag, weight, failure_workflow, sort_order, options")
      .eq("template_id", insp.template_id)
      .order("sort_order");
    setItems(templateItems || []);

    const { data: existingAnswers } = await supabase
      .from("answers")
      .select("id, template_item_id, value, notes, evidence(id, file_path)")
      .eq("inspection_id", id);

    const mapped = {};
    for (const a of existingAnswers || []) {
      const evidenceWithUrls = await Promise.all(
        (a.evidence || []).map(async (ev) => ({ ...ev, signedUrl: await resolveSignedUrl(ev.file_path) }))
      );
      mapped[a.template_item_id] = {
        answerId: a.id,
        value: a.value || "",
        notes: a.notes || "",
        photoFile: null,
        evidence: evidenceWithUrls,
      };
    }

    // Recover anything still sitting in the offline queue from a previous
    // session — e.g. the tab was closed while offline before it could sync.
    // This is what makes offline work actually durable, not just resilient
    // to a brief network blip.
    try {
      const queuedAnswers = await getQueuedAnswers(id);
      const queuedPhotos = await getQueuedPhotos(id);
      let recoveredCount = 0;

      queuedAnswers.forEach((qa) => {
        mapped[qa.itemId] = {
          ...(mapped[qa.itemId] || { answerId: null, evidence: [] }),
          value: qa.value,
          notes: qa.notes,
          pendingSync: true,
        };
        recoveredCount++;
      });
      queuedPhotos.forEach((qp) => {
        mapped[qp.itemId] = {
          ...(mapped[qp.itemId] || { answerId: null, value: "", notes: "", evidence: [] }),
          queuedPhotoName: qp.fileName,
          queuedPhotoBlob: qp.blob,
          pendingSync: true,
        };
        recoveredCount++;
      });

      if (recoveredCount > 0) {
        setSyncBanner(`Recovered ${recoveredCount} unsynced answer(s) from this device — will sync automatically once online.`);
      }
    } catch {
      // IndexedDB unavailable (very old browser, private browsing in some
      // cases) — offline support just won't be available; everything else
      // still works normally.
    }

    setAnswers(mapped);
    setLoading(false);
  }

  function updateAnswer(itemId, field, value) {
    setAnswers((prev) => {
      const updated = {
        ...prev,
        [itemId]: { answerId: null, value: "", notes: "", photoFile: null, evidence: [], ...prev[itemId], [field]: value },
      };

      // Persist to IndexedDB on every change, not just on Save/Submit — this
      // is what protects the person's work if they lose signal and close
      // the tab before it ever gets a chance to reach the server.
      const a = updated[itemId];
      if (field === "photoFile" && value) {
        queuePhoto(id, itemId, value, value.name).catch(() => {});
      } else if (field === "value" || field === "notes") {
        queueAnswer(id, itemId, { value: a.value, notes: a.notes }).catch(() => {});
      }

      return updated;
    });
  }

  async function handleQuickVoiceResult(transcript) {
    setQuickVoiceError("");
    setQuickVoiceSuggestion(null);
    setQuickVoiceLoading(true);
    try {
      const res = await fetch("/api/voice-parse-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, itemQuestions: items.map((i) => i.question) }),
      });
      const data = await res.json();
      if (data.skipped) {
        setQuickVoiceError("Voice matching isn't set up yet.");
        return;
      }
      if (data.error || !data.matchedItem || !data.value) {
        setQuickVoiceError("Couldn't confidently match that to an item — try again, or fill it in manually.");
        return;
      }
      const matched = items.find((i) => i.question === data.matchedItem);
      if (!matched) {
        setQuickVoiceError("Couldn't confidently match that to an item — try again, or fill it in manually.");
        return;
      }
      setQuickVoiceSuggestion({ item: matched, value: data.value, notes: data.notes, transcript });
    } catch {
      setQuickVoiceError("Voice matching failed — try again.");
    } finally {
      setQuickVoiceLoading(false);
    }
  }

  function applyQuickVoiceSuggestion() {
    if (!quickVoiceSuggestion) return;
    const { item, value, notes } = quickVoiceSuggestion;
    updateAnswer(item.id, "value", value);
    if (notes) updateAnswer(item.id, "notes", notes);
    setQuickVoiceSuggestion(null);
  }

  async function saveOneAnswer(item) {
    const a = answers[item.id];
    if (!a || (!a.value && !a.notes && !a.photoFile && !a.pendingSync)) return null;

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
    // A photo can come from the live file input (photoFile) or from a
    // recovered offline queue entry (queuedPhotoBlob) — either way it
    // still needs to actually reach Supabase storage.
    const photoToUpload = a.photoFile || a.queuedPhotoBlob;
    const photoName = a.photoFile?.name || a.queuedPhotoName;
    if (photoToUpload) {
      const path = `${inspection.site_id}/evidence/${answerId}-${Date.now()}-${photoName}`;
      const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, photoToUpload);
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

      const location = a.includeLocation ? await getLocation() : null;
      const { data: evRow, error: evErr } = await supabase
        .from("evidence")
        .insert({
          answer_id: answerId,
          file_path: path,
          captured_by: profile?.id,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        })
        .select()
        .single();
      if (evErr) throw evErr;
      const signedUrl = await resolveSignedUrl(evRow.file_path);
      newEvidence = [...(a.evidence || []), { ...evRow, signedUrl }];
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

    // Now durably saved server-side — clear it from the local offline
    // queue so it doesn't get recovered/re-synced again unnecessarily.
    removeQueuedAnswer(id, item.id).catch(() => {});
    removeQueuedPhoto(id, item.id).catch(() => {});

    // AI photo consistency check — only worth asking when someone marked
    // "Pass" and attached a photo; a "Fail" is already flagged by the
    // person, no second opinion needed. Runs in the background — never
    // blocks or delays saving.
    if (item.answer_type === "pass_fail_na" && a.value === "pass" && a.photoFile) {
      checkPhotoConsistency(item, a.photoFile);
    }

    setAnswers((prev) => ({
      ...prev,
      [item.id]: {
        ...prev[item.id],
        answerId,
        photoFile: null,
        queuedPhotoBlob: null,
        queuedPhotoName: null,
        evidence: newEvidence,
        pendingSync: false,
      },
    }));

    return answerId;
  }

  async function checkPhotoConsistency(item, photoFile) {
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });

      const res = await fetch("/api/check-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: photoFile.type, question: item.question }),
      });
      const result = await res.json();

      if (result.flagged) {
        setAnswers((prev) => ({
          ...prev,
          [item.id]: { ...prev[item.id], aiWarning: result.reason || "Photo may not match a Pass result." },
        }));
      }
    } catch {
      // Never let a failed AI check disrupt anything else on the page —
      // this is a helpful suggestion, not a required step.
    }
  }

  // Attempts to sync everything currently queued. Used both by the manual
  // Save Progress button and automatically the moment connectivity returns.
  async function flushQueue() {
    let anyFailed = false;
    for (const item of items) {
      try {
        await saveOneAnswer(item);
      } catch {
        anyFailed = true;
      }
    }
    if (!anyFailed) {
      setSyncBanner("");
    }
  }

  async function uploadSignature(blob, role) {
    const path = `${inspection.site_id}/signatures/${id}-${role}-${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, blob);
    if (uploadErr) throw new Error(`Signature upload failed: ${uploadErr.message}`);
    return path;
  }

  async function handleSaveProgress() {
    setError("");
    setSaving(true);

    if (!isOnline) {
      // Nothing to send — updateAnswer already wrote everything to
      // IndexedDB as it happened. Just confirm that to the person.
      setSyncBanner("You're offline — your answers are saved on this device and will sync automatically once you're back online.");
      setSaving(false);
      return;
    }

    try {
      await flushQueue();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function handleSubmit() {
    setError("");
    if (!isOnline) {
      setError("Submitting needs an internet connection. Your answers are saved on this device — connect and try again.");
      return;
    }
    if (!inspectorSignature) {
      setError("Please sign before submitting — this is your attestation that the inspection is accurate.");
      return;
    }
    setSubmitting(true);
    try {
      await flushQueue();
      const score = computeScore(items, answers);
      const signaturePath = await uploadSignature(inspectorSignature, "inspector");

      const { data: updated, error: submitErr } = await supabase
        .from("inspections")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          score,
          assigned_reviewer_id: selectedReviewerId || null,
          inspector_signature_path: signaturePath,
          inspector_signed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(SELECT_FIELDS)
        .single();
      if (submitErr) throw submitErr;
      setInspection(await withSignedSignatures(updated));

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
    setInspection(await withSignedSignatures(updated));

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
      const signaturePath = await uploadSignature(approverSignature, "approver");
      await advanceStatus("approved", {
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        approver_signature_path: signaturePath,
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
      {!isOnline && (
        <div className="flex items-center gap-2 bg-slate-800 text-white text-sm px-3 py-2 rounded-lg mb-4">
          <WifiOff size={15} /> You're offline — answers are saving to this device and will sync automatically once you're back online.
        </div>
      )}
      {isOnline && syncBanner && (
        <div className="flex items-center gap-2 bg-sky-50 text-sky-800 border border-sky-200 text-sm px-3 py-2 rounded-lg mb-4">
          <RefreshCw size={14} className="animate-spin" /> {syncBanner}
        </div>
      )}

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

      {!isSubmitted && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <VoiceInput onResult={handleQuickVoiceResult} />
            <p className="text-sm text-indigo-900">
              <strong>Quick voice log</strong> — speak a finding and I'll match it to the right item
            </p>
            {quickVoiceLoading && <span className="text-xs text-indigo-600">Listening for a match…</span>}
          </div>
          {quickVoiceError && <p className="text-xs text-rose-600 mt-2">{quickVoiceError}</p>}
          {quickVoiceSuggestion && (
            <div className="mt-3 bg-white border border-indigo-300 rounded-lg p-3">
              <p className="text-sm text-slate-800 mb-1">
                Matched: <strong>{quickVoiceSuggestion.item.question}</strong>
              </p>
              <p className="text-sm text-slate-600 mb-2">
                Suggested result: <strong className="uppercase">{quickVoiceSuggestion.value}</strong>
                {quickVoiceSuggestion.notes && <> — "{quickVoiceSuggestion.notes}"</>}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyQuickVoiceSuggestion}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setQuickVoiceSuggestion(null)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
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
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-slate-800">{item.question}</p>
                {a.pendingSync && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Not yet synced
                  </span>
                )}
              </div>

              {a.aiWarning && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-amber-800">
                      <span className="font-medium">AI check:</span> {a.aiWarning} Would you like to review?
                    </p>
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => updateAnswer(item.id, "value", "fail")}
                        className="text-xs font-medium px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Change to Fail
                      </button>
                      <button
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [item.id]: { ...prev[item.id], aiWarning: null } }))
                        }
                        className="text-xs font-medium px-2 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        Dismiss — photo is fine
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                <div className="flex items-start gap-2 mb-2">
                  <textarea
                    placeholder="Notes (optional)"
                    value={a.notes}
                    onChange={(e) => updateAnswer(item.id, "notes", e.target.value)}
                    rows={2}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <VoiceInput onResult={(text) => updateAnswer(item.id, "notes", (a.notes ? a.notes + " " : "") + text)} />
                </div>
              )}
              {isSubmitted && a.notes && <p className="text-xs text-slate-500 mb-2">{a.notes}</p>}

              {!isSubmitted && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
                    <Camera size={14} />
                    {a.photoFile ? a.photoFile.name : a.queuedPhotoName ? `${a.queuedPhotoName} (saved offline)` : "Attach photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
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
                      href={ev.signedUrl}
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

      {isSubmitted && inspection.inspectorSignatureUrl && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Inspector's signature</p>
          <img src={inspection.inspectorSignatureUrl} alt="Inspector signature" className="border border-slate-200 rounded-lg h-16" />
        </div>
      )}

      {isSubmitted && inspection.approverSignatureUrl && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Approver's signature</p>
          <img src={inspection.approverSignatureUrl} alt="Approver signature" className="border border-slate-200 rounded-lg h-16" />
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
            className="min-h-[44px] text-sm font-medium px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save progress"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting || !inspectorSignature || !isOnline}
            title={!isOnline ? "Submitting needs an internet connection" : undefined}
            className="flex-1 min-h-[44px] bg-slate-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : !isOnline ? "Offline — can't submit yet" : "Submit inspection"}
          </button>
        </div>
      )}
    </main>
  );
}
