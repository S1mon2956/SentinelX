"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const ROLE_TYPES = ["employee", "supervisor", "plant_operator"];
const EXPERIENCE_LEVELS = ["apprentice", "skilled", "supervisor", "manager"];

export default function JoinSitePage() {
  const { siteId } = useParams();
  const { session, profile, loading: authLoading } = useAuth();

  const [step, setStep] = useState("loading"); // 'loading' | 'account' | 'induction' | 'done'
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Account creation fields (only used if not already logged in)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  // Site + induction content
  const [siteName, setSiteName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [declarations, setDeclarations] = useState([]);
  const [requirements, setRequirements] = useState([]);

  // Induction form fields
  const [roleType, setRoleType] = useState("employee");
  const [trade, setTrade] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("apprentice");
  const [acceptedIds, setAcceptedIds] = useState(new Set());
  const [videoConfirmed, setVideoConfirmed] = useState(false);
  const [qualificationFile, setQualificationFile] = useState(null);

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
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order")
      .then(({ data }) => setDeclarations(data || []));
    supabase
      .from("trade_qualification_requirements")
      .select("*, qualification_card_types(label, qualification_schemes(name))")
      .then(({ data }) => setRequirements(data || []));
  }, [siteId]);

  const roleDeclarations = declarations.filter((d) => d.role_type === roleType);
  const allDeclarationsAccepted = roleDeclarations.length === 0 || roleDeclarations.every((d) => acceptedIds.has(d.id));
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
    if (!allDeclarationsAccepted) {
      setError("Please accept all declarations before submitting.");
      return;
    }
    if (!videoConfirmed && videoUrl) {
      setError("Please confirm you've watched the induction video.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Please confirm your email address, then sign in and try again.");

      const membershipId = await getOrCreateMembership(userId);

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
          card_type_id: matchedRequirement?.required_card_type_id || null,
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
                <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Plasterer" className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
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
                This role requires: <strong>{matchedRequirement.qualification_card_types?.qualification_schemes?.name} {matchedRequirement.qualification_card_types?.label}</strong>. Please upload a photo of your card below.
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500">Qualification card photo {matchedRequirement ? "(required)" : "(optional)"}</label>
              <input type="file" accept="image/*" onChange={(e) => setQualificationFile(e.target.files?.[0] || null)} className="w-full mt-1 text-sm" />
            </div>

            {roleDeclarations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Declarations</p>
                {roleDeclarations.map((d) => (
                  <label key={d.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={acceptedIds.has(d.id)}
                      onChange={(e) =>
                        setAcceptedIds((prev) => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(d.id) : next.delete(d.id);
                          return next;
                        })
                      }
                      className="mt-1"
                    />
                    {d.declaration_text}
                  </label>
                ))}
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
