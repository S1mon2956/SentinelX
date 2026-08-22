"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import SignaturePad from "@/components/SignaturePad";

const ROLE_TYPES = ["employee", "supervisor", "plant_operator"];
const EXPERIENCE_LEVELS = ["apprentice", "skilled", "supervisor", "manager"];

// SignaturePad produces a transparent-background PNG — fine on screen, but
// it would render invisible on a dark surface in any future PDF/export. We
// composite it onto a white background before storing it anywhere durable.
function compositeToWhiteBackground(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((finalBlob) => {
        URL.revokeObjectURL(url);
        finalBlob ? resolve(finalBlob) : reject(new Error("Could not process signature image."));
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function JoinSitePage() {
  const { siteId } = useParams();
  const { session, loading: authLoading } = useAuth();

  const [step, setStep] = useState("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  const [siteName, setSiteName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [declarations, setDeclarations] = useState([]); // joined with declaration_templates
  const [requirements, setRequirements] = useState([]);
  const [cardTypes, setCardTypes] = useState([]);

  const [roleType, setRoleType] = useState("employee");
  const [trade, setTrade] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("apprentice");
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [qualificationFile, setQualificationFile] = useState(null);
  const [declaredCardTypeId, setDeclaredCardTypeId] = useState("");
  const [signatureBlob, setSignatureBlob] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    setStep(session ? "induction" : "account");
  }, [authLoading, session]);

  useEffect(() => {
    supabase.from("companies").select("id, name").then(({ data }) => setCompanies(data || []));
    supabase.from("site_public_info").select("name").eq("id", siteId).single().then(({ data }) => setSiteName(data?.name || ""));
    supabase.from("site_inductions").select("video_url").eq("site_id", siteId).maybeSingle().then(({ data }) => setVideoUrl(data?.video_url || ""));
    supabase
      .from("site_induction_declarations")
      .select("*, declaration_templates(role_type, declaration_text)")
      .eq("site_id", siteId)
      .then(({ data }) => setDeclarations(data || []));
    supabase
      .from("trade_qualification_requirements")
      .select("*, qualification_card_types(label, qualification_schemes(name))")
      .then(({ data }) => setRequirements(data || []));
    supabase
      .from("qualification_card_types")
      .select("*, qualification_schemes(name)")
      .order("level_rank")
      .then(({ data }) => setCardTypes(data || []));
  }, [siteId]);

  const distinctTrades = [...new Set(requirements.map((r) => r.trade))];
  const roleDeclarations = declarations.filter((d) => d.declaration_templates?.role_type === roleType);
  const matchedRequirement = requirements.find(
    (r) => r.trade.trim().toLowerCase() === trade.trim().toLowerCase() && r.experience_level === experienceLevel
  );

  async function handleCreateAccount(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("induction");
  }

  async function getOrCreateMembership(userId) {
    let query = supabase.from("site_memberships").select("id").eq("user_id", userId).eq("site_id", siteId);
    query = selectedCompany ? query.eq("company_id", selectedCompany) : query.is("company_id", null);
    const { data: existing } = await query.maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from("site_memberships")
      .insert({ user_id: userId, site_id: siteId, company_id: selectedCompany || null, role: "user", status: "pending" })
      .select()
      .single();
    if (error) throw error;
    return created.id;
  }

  async function handleSubmitInduction(e) {
    e.preventDefault();
    setError("");
    if (!signatureBlob) {
      setError("Please sign to confirm you've read and accept the declarations above.");
      return;
    }
    if (videoUrl && !videoConfirmed) {
      setError("Please confirm you've watched the induction video.");
      return;
    }
    if (matchedRequirement && (!declaredCardTypeId || !qualificationFile)) {
      setError("Please select your card type and upload a photo of it — this role requires it.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Please confirm your email address, then sign in and try again.");

      const membershipId = await getOrCreateMembership(userId);

      const whiteSignature = await compositeToWhiteBackground(signatureBlob);
      const sigPath = `signatures/${membershipId}-${Date.now()}.png`;
      const { error: sigUploadErr } = await supabase.storage.from("evidence").upload(sigPath, whiteSignature);
      if (sigUploadErr) throw new Error(`Signature upload failed: ${sigUploadErr.message}`);
      const { data: sigUrlData } = supabase.storage.from("evidence").getPublicUrl(sigPath);

      const { data: induction, error: indErr } = await supabase
        .from("site_membership_inductions")
        .upsert(
          {
            site_membership_id: membershipId,
            trade: trade.trim() || null,
            experience_level: experienceLevel,
            role_type: roleType,
            declarations_accepted: true,
            video_watched_at: videoUrl ? new Date().toISOString() : null,
            signature_url: sigUrlData.publicUrl,
            signed_at: new Date().toISOString(),
            status: "pending",
          },
          { onConflict: "site_membership_id" }
        )
        .select()
        .single();
      if (indErr) throw indErr;

      if (qualificationFile) {
        const path = `qualifications/${induction.id}-${Date.now()}-${qualificationFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, qualificationFile);
        if (uploadErr) throw new Error(`Card upload failed: ${uploadErr.message}`);
        const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(path);
        const { error: qualErr } = await supabase.from("qualification_uploads").insert({
          site_membership_induction_id: induction.id,
          file_url: urlData.publicUrl,
          card_type_id: declaredCardTypeId || null,
        });
        if (qualErr) throw qualErr;
      }

      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (step === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Site induction — {siteName || "..."}</h1>
        <p className="text-sm text-slate-500 mb-6">
          {step === "account" && "Step 1 of 2 — create your account"}
          {step === "induction" && "Step 2 of 2 — complete your induction"}
          {step === "done" && "You're all set"}
        </p>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {step === "account" && (
          <form onSubmit={handleCreateAccount} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Full name</label>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Creating account..." : "Continue"}
            </button>
          </form>
        )}

        {step === "induction" && (
          <form onSubmit={handleSubmitInduction} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Company (optional)</label>
              <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">None / not sure</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Your role on this site</label>
              <select value={roleType} onChange={(e) => setRoleType(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {ROLE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-500">Trade</label>
                <input
                  list="trade-options"
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  placeholder="Start typing..."
                  className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <datalist id="trade-options">
                  {distinctTrades.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Experience level</label>
                <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
            </div>

            {matchedRequirement && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                This role requires: <strong>{matchedRequirement.qualification_card_types?.qualification_schemes?.name} {matchedRequirement.qualification_card_types?.label}</strong>. Please select and upload your card below.
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500">Card you're presenting {matchedRequirement ? "(required)" : "(optional)"}</label>
              <select value={declaredCardTypeId} onChange={(e) => setDeclaredCardTypeId(e.target.value)} className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select a card type...</option>
                {cardTypes.map((c) => <option key={c.id} value={c.id}>{c.qualification_schemes?.name} — {c.label}</option>)}
              </select>
              <div className="mt-2 border border-slate-300 rounded-lg px-3 py-2">
                <input type="file" accept="image/*" onChange={(e) => setQualificationFile(e.target.files?.[0] || null)} className="w-full text-sm" />
              </div>
            </div>

            {roleDeclarations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Declarations</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  {roleDeclarations.map((d) => (
                    <p key={d.id} className="text-sm text-slate-700">{d.declaration_templates?.declaration_text}</p>
                  ))}
                </div>
              </div>
            )}

            {videoUrl && (
              <div>
                <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 underline">
                  Watch the induction video
                </a>
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
                  <input type="checkbox" checked={videoConfirmed} onChange={(e) => setVideoConfirmed(e.target.checked)} />
                  I confirm I've watched the induction video
                </label>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Sign to confirm you've read and accept the declarations above</p>
              <SignaturePad onChange={setSignatureBlob} />
            </div>

            <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Submitting..." : "Submit for review"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
            Your induction has been submitted. A site manager will review it before you're given access.
          </div>
        )}
      </div>
    </div>
  );
}
