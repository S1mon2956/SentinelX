"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, X, HelpCircle, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

const EXPERIENCE_LEVELS = ["apprentice", "skilled", "supervisor", "manager"];

export default function SiteInductionSetupPage() {
  const { siteId } = useParams();
  const { isSuperAdmin, canManageSite, memberships } = useAuth();
  const allowed = canManageSite(siteId);

  const [siteName, setSiteName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [declarationTemplates, setDeclarationTemplates] = useState([]);
  const [attached, setAttached] = useState([]); // rows from site_induction_declarations
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // People roster — every status, not just pending, so this page is the one
  // place to see who's onboarded, who's waiting, and who was turned away.
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  useEffect(() => {
    if (allowed) {
      load();
      loadPeople();
    }
  }, [allowed, siteId]);

  async function load() {
    setLoading(true);
    const [{ data: site }, { data: induction }, { data: templateData }, { data: attachedData }] = await Promise.all([
      supabase.from("sites").select("name").eq("id", siteId).single(),
      supabase.from("site_inductions").select("*").eq("site_id", siteId).maybeSingle(),
      supabase.from("declaration_templates").select("*").order("role_type"),
      supabase.from("site_induction_declarations").select("*").eq("site_id", siteId),
    ]);
    setSiteName(site?.name || "");
    setVideoUrl(induction?.video_url || "");
    setDeclarationTemplates(templateData || []);
    setAttached(attachedData || []);
    setLoading(false);
  }

  async function saveVideoUrl(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("site_inductions")
      .upsert({ site_id: siteId, video_url: videoUrl.trim() || null }, { onConflict: "site_id" });
    setSaving(false);
    if (error) return alert(error.message);
  }

  async function toggleTemplate(templateId, isAttached) {
    if (isAttached) {
      const row = attached.find((a) => a.declaration_template_id === templateId);
      const { error } = await supabase.from("site_induction_declarations").delete().eq("id", row.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("site_induction_declarations").insert({
        site_id: siteId,
        declaration_template_id: templateId,
        sort_order: attached.length,
      });
      if (error) return alert(error.message);
    }
    load();
  }

  async function loadPeople() {
    setPeopleLoading(true);
    setPeopleError("");
    const { data, error: err } = await supabase
      .from("site_memberships")
      .select(`
        id, role, status, created_at, site_id, company_id,
        users!user_id(full_name, email),
        companies(name),
        site_membership_inductions(
          id, trade, experience_level, role_type, declarations_accepted, video_watched_at,
          signature_path, status, reviewer_notes, reviewed_at,
          qualification_uploads(id, file_path, qualification_card_types(label, qualification_schemes(name)))
        )
      `)
      .eq("site_id", siteId)
      .order("created_at", { ascending: true });
    if (err) setPeopleError(err.message);

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
    setPeople(withSignedUrls);
    setPeopleLoading(false);
  }

  async function resolveSignedUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("personal-documents").createSignedUrl(path, 300);
    if (error) return null;
    return data?.signedUrl || null;
  }

  // A company_manager only sees people from their own company on this
  // site — a site_manager (or super admin) sees everyone.
  const isFullSiteManager =
    isSuperAdmin || memberships.some((m) => m.site_id === siteId && m.role === "site_manager");
  const visiblePeople = isFullSiteManager
    ? people
    : people.filter((p) => memberships.some((m) => m.site_id === siteId && m.role === "company_manager" && m.company_id === p.company_id));

  const filteredPeople = statusFilter === "all" ? visiblePeople : visiblePeople.filter((p) => p.status === statusFilter);

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
    if (err) return setPeopleError(err.message);
    loadPeople();
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
    if (err) return setPeopleError(err.message);
    loadPeople();
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
    if (err) return setPeopleError(err.message);
    loadPeople();
  }

  if (!allowed) {
    return <main className="p-6 text-sm text-slate-500">You don't have permission to manage this site's inductions.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Inductions — {siteName}</h1>
        <p className="text-sm text-slate-500">
          Who's onboarded, who's waiting for review, and how this site's induction is set up.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">People</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>

        {peopleError && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{peopleError}</p>
        )}
        {peopleLoading && <p className="text-sm text-slate-500">Loading...</p>}
        {!peopleLoading && filteredPeople.length === 0 && <p className="text-sm text-slate-500">No one here.</p>}

        <div className="space-y-3">
          {filteredPeople.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.users?.full_name || r.users?.email}</p>
                  <p className="text-xs text-slate-500">
                    {r.role}
                    {r.companies?.name ? ` · ${r.companies.name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600"}`}>
                    {r.status}
                  </span>
                  {r.status === "pending" && (
                    <>
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
                    </>
                  )}
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
                  No induction submitted — this was a plain access request.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Induction video</h2>
            <form onSubmit={saveVideoUrl} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500">
                  Video link (YouTube or Vimeo, set to "unlisted")
                </label>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtu.be/..."
                  className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save video link"}
              </button>
            </form>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Declarations for this site</h2>
            <p className="text-xs text-slate-400 mb-2">
              Choose which standard declarations apply here.
              {isSuperAdmin ? " Wording is managed centrally in the qualification library below." : ""}
            </p>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              {declarationTemplates.length === 0 && <p className="text-sm text-slate-400">No declaration templates exist yet.</p>}
              {declarationTemplates.map((t) => {
                const isAttached = attached.some((a) => a.declaration_template_id === t.id);
                return (
                  <label key={t.id} className="flex items-start gap-2 text-sm text-slate-700 border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <input type="checkbox" checked={isAttached} onChange={() => toggleTemplate(t.id, isAttached)} className="mt-1" />
                    <span>
                      <span className="text-xs uppercase text-slate-400 mr-2">{t.role_type}</span>
                      {t.declaration_text}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </>
      )}

      {isSuperAdmin && <QualificationLibrary declarationTemplates={declarationTemplates} onChange={load} />}
    </main>
  );
}

function QualificationLibrary({ declarationTemplates, onChange }) {
  const [schemes, setSchemes] = useState([]);
  const [cardTypes, setCardTypes] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newSchemeName, setNewSchemeName] = useState("");
  const [newCardType, setNewCardType] = useState({ scheme_id: "", label: "", level_rank: 0 });
  const [newRequirement, setNewRequirement] = useState({ trade: "", experience_level: "apprentice", required_card_type_id: "" });
  const [newTemplate, setNewTemplate] = useState({ role_type: "employee", declaration_text: "" });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: schemeData }, { data: cardTypeData }, { data: reqData }] = await Promise.all([
      supabase.from("qualification_schemes").select("*").order("name"),
      supabase.from("qualification_card_types").select("*, qualification_schemes(name)").order("level_rank"),
      supabase.from("trade_qualification_requirements").select("*, qualification_card_types(label, qualification_schemes(name))").order("trade"),
    ]);
    setSchemes(schemeData || []);
    setCardTypes(cardTypeData || []);
    setRequirements(reqData || []);
    setLoading(false);
  }

  async function addScheme(e) {
    e.preventDefault();
    if (!newSchemeName.trim()) return;
    const { error } = await supabase.from("qualification_schemes").insert({ name: newSchemeName.trim() });
    if (error) return alert(error.message);
    setNewSchemeName("");
    load();
  }

  async function deleteScheme(id) {
    if (!confirm("Delete this scheme? This also removes its card types and any requirements using them.")) return;
    const { error } = await supabase.from("qualification_schemes").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addCardType(e) {
    e.preventDefault();
    if (!newCardType.scheme_id || !newCardType.label.trim()) return;
    const { error } = await supabase.from("qualification_card_types").insert({
      scheme_id: newCardType.scheme_id,
      label: newCardType.label.trim(),
      level_rank: Number(newCardType.level_rank) || 0,
    });
    if (error) return alert(error.message);
    setNewCardType({ scheme_id: "", label: "", level_rank: 0 });
    load();
  }

  async function deleteCardType(id) {
    if (!confirm("Delete this card type? This also removes any trade requirements using it.")) return;
    const { error } = await supabase.from("qualification_card_types").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addRequirement(e) {
    e.preventDefault();
    if (!newRequirement.trade.trim() || !newRequirement.required_card_type_id) return;
    const { error } = await supabase.from("trade_qualification_requirements").insert({
      trade: newRequirement.trade.trim(),
      experience_level: newRequirement.experience_level,
      required_card_type_id: newRequirement.required_card_type_id,
    });
    if (error) return alert(error.message);
    setNewRequirement({ trade: "", experience_level: "apprentice", required_card_type_id: "" });
    load();
  }

  async function deleteRequirement(id) {
    const { error } = await supabase.from("trade_qualification_requirements").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function addTemplate(e) {
    e.preventDefault();
    if (!newTemplate.declaration_text.trim()) return;
    const { error } = await supabase.from("declaration_templates").insert({
      role_type: newTemplate.role_type,
      declaration_text: newTemplate.declaration_text.trim(),
    });
    if (error) return alert(error.message);
    setNewTemplate({ role_type: "employee", declaration_text: "" });
    onChange();
  }

  async function deleteTemplate(id) {
    const { error } = await supabase.from("declaration_templates").delete().eq("id", id);
    if (error) return alert(error.message);
    onChange();
  }

  if (loading) return null;

  return (
    <div className="space-y-8 pt-4 border-t border-slate-200">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Qualification library</h2>
        <p className="text-xs text-slate-400">
          Applies across every site — card schemes, card types, and trade-based rules used by the induction process.
        </p>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Qualification schemes</h3>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
          {schemes.length === 0 && <p className="text-sm text-slate-400">No schemes yet.</p>}
          {schemes.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <span className="text-slate-800">{s.name}</span>
              <button onClick={() => deleteScheme(s.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete scheme">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addScheme} className="flex gap-2">
          <input
            placeholder="e.g. CSCS"
            value={newSchemeName}
            onChange={(e) => setNewSchemeName(e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
            Add scheme
          </button>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Card types</h3>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
          {cardTypes.length === 0 && <p className="text-sm text-slate-400">No card types yet.</p>}
          {cardTypes.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <span className="text-slate-800">
                {c.qualification_schemes?.name} — {c.label}{" "}
                <span className="text-xs text-slate-400">(level {c.level_rank})</span>
              </span>
              <button onClick={() => deleteCardType(c.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete card type">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addCardType} className="flex flex-wrap gap-2">
          <select
            value={newCardType.scheme_id}
            onChange={(e) => setNewCardType((p) => ({ ...p, scheme_id: e.target.value }))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Scheme...</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            placeholder="e.g. Gold - Supervisor"
            value={newCardType.label}
            onChange={(e) => setNewCardType((p) => ({ ...p, label: e.target.value }))}
            className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Level"
            value={newCardType.level_rank}
            onChange={(e) => setNewCardType((p) => ({ ...p, level_rank: e.target.value }))}
            className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
            Add card type
          </button>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Trade requirements</h3>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
          {requirements.length === 0 && <p className="text-sm text-slate-400">No requirements yet.</p>}
          {requirements.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <span className="text-slate-800">
                {r.trade} <span className="text-xs text-slate-400">({r.experience_level})</span> requires{" "}
                <span className="font-medium">
                  {r.qualification_card_types?.qualification_schemes?.name} {r.qualification_card_types?.label}
                </span>
              </span>
              <button onClick={() => deleteRequirement(r.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete requirement">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addRequirement} className="flex flex-wrap gap-2">
          <input
            placeholder="Trade, e.g. Plasterer"
            value={newRequirement.trade}
            onChange={(e) => setNewRequirement((p) => ({ ...p, trade: e.target.value }))}
            className="flex-1 min-w-[140px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={newRequirement.experience_level}
            onChange={(e) => setNewRequirement((p) => ({ ...p, experience_level: e.target.value }))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {EXPERIENCE_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
          <select
            value={newRequirement.required_card_type_id}
            onChange={(e) => setNewRequirement((p) => ({ ...p, required_card_type_id: e.target.value }))}
            className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Required card type...</option>
            {cardTypes.map((c) => (
              <option key={c.id} value={c.id}>{c.qualification_schemes?.name} — {c.label}</option>
            ))}
          </select>
          <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
            Add requirement
          </button>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Declaration templates</h3>
        <p className="text-xs text-slate-400 mb-2">Standard wording, used by every site — sites choose which apply, they can't edit the text.</p>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mb-3">
          {declarationTemplates.length === 0 && <p className="text-sm text-slate-400">No declaration templates yet.</p>}
          {declarationTemplates.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
              <span className="text-slate-800">
                <span className="text-xs uppercase text-slate-400 mr-2">{t.role_type}</span>
                {t.declaration_text}
              </span>
              <button onClick={() => deleteTemplate(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete template">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addTemplate} className="space-y-2">
          <select
            value={newTemplate.role_type}
            onChange={(e) => setNewTemplate((p) => ({ ...p, role_type: e.target.value }))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="employee">employee</option>
            <option value="supervisor">supervisor</option>
            <option value="plant_operator">plant_operator</option>
          </select>
          <textarea
            placeholder="e.g. I hereby declare that I am qualified and fit to operate plant and machinery, and I understand that I must complete my pre-use checks."
            value={newTemplate.declaration_text}
            onChange={(e) => setNewTemplate((p) => ({ ...p, declaration_text: e.target.value }))}
            rows={2}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
            Add declaration template
          </button>
        </form>
      </section>
    </div>
  );
}
