"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Plus, PlayCircle, ClipboardList, Archive, ArchiveRestore, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  reviewed: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
};

export default function InspectionsListPage() {
  const router = useRouter();
  const { profile, activeSiteId, activeMembership, isSuperAdmin } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showChooser, setShowChooser] = useState(false);

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId, showArchived]);

  async function load() {
    setLoading(true);

    let query = supabase
      .from("inspections")
      .select("id, status, score, submitted_at, created_at, inspector_id, company_id, archived_at, templates(name, category), users:inspector_id(full_name, email)")
      .eq("site_id", activeSiteId);
    query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      query = query.eq("company_id", activeMembership.company_id);
    }

    const { data: inspectionData } = await query;
    // submitted_at is null for drafts — fall back to created_at so drafts
    // get a real date (both for display and for sorting) instead of tying
    // and stacking in whatever order the DB happens to return them.
    const sorted = (inspectionData || []).slice().sort(
      (a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at)
    );
    setInspections(sorted);

    const { data: siteCompanies } = await supabase
      .from("site_companies")
      .select("company_id, companies(id, name)")
      .eq("site_id", activeSiteId);
    setCompanies((siteCompanies || []).map((sc) => sc.companies).filter(Boolean));

    setLoading(false);
  }

  async function discardDraft(e, inspectionId) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Discard this draft? This can't be undone.")) return;
    const { error } = await supabase.from("inspections").delete().eq("id", inspectionId);
    if (error) return alert(error.message);
    setInspections((prev) => prev.filter((i) => i.id !== inspectionId));
  }

  async function toggleArchive(e, inspection) {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase
      .from("inspections")
      .update({ archived_at: inspection.archived_at ? null : new Date().toISOString() })
      .eq("id", inspection.id);
    if (error) return alert(error.message);
    setInspections((prev) => prev.filter((i) => i.id !== inspection.id));
  }

  function canDiscard(inspection) {
    if (inspection.status !== "draft") return false;
    return (
      isSuperAdmin ||
      inspection.inspector_id === profile?.id ||
      activeMembership?.role === "site_manager" ||
      activeMembership?.role === "company_manager"
    );
  }

  function canArchive() {
    return isSuperAdmin || activeMembership?.role === "site_manager" || activeMembership?.role === "company_manager";
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  const filtered = inspections
    .filter((i) => filter === "all" || i.status === filter)
    .filter((i) => companyFilter === "all" || i.company_id === companyFilter);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Inspections</h1>
        <button
          onClick={() => setShowChooser(true)}
          className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800 shrink-0"
        >
          <Plus size={16} /> New Inspection
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted — needs review</option>
          <option value="reviewed">Reviewed — needs approval</option>
          <option value="approved">Approved</option>
        </select>

        {companies.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="all">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {canArchive() && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-slate-500">No inspections here.</p>}

      <div className="space-y-2">
        {filtered.map((i) => (
          <Link
            key={i.id}
            href={`/inspections/${i.id}`}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">{i.templates?.name}</p>
              <p className="text-xs text-slate-500">
                {i.users?.full_name || i.users?.email || "Unknown inspector"}
                {` · ${new Date(i.submitted_at || i.created_at).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {i.score != null && <span className="text-sm font-semibold text-slate-700">{i.score}%</span>}
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[i.status]}`}>
                {i.status}
              </span>
              {canDiscard(i) && (
                <button
                  onClick={(e) => discardDraft(e, i.id)}
                  className="flex items-center justify-center min-w-[32px] min-h-[32px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  aria-label="Discard draft"
                  title="Discard draft"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {canArchive() && i.status !== "draft" && (
                <button
                  onClick={(e) => toggleArchive(e, i)}
                  className="flex items-center justify-center min-w-[32px] min-h-[32px] rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  aria-label={i.archived_at ? "Unarchive" : "Archive"}
                  title={i.archived_at ? "Unarchive" : "Archive"}
                >
                  {i.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
              )}
            </div>
          </Link>
        ))}
      </div>

      {showChooser && (
        <NewInspectionChooser
          onClose={() => setShowChooser(false)}
          onStarted={(id) => router.push(`/inspections/${id}`)}
        />
      )}
    </main>
  );
}

function NewInspectionChooser({ onClose, onStarted }) {
  const { profile, activeSiteId, activeMembership } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("templates")
      .select("id, name, category, current_version, template_items(id)")
      .is("archived_at", null)
      .order("name");
    setTemplates(data || []);
    setLoading(false);
  }

  async function startInspection(template) {
    setError("");
    setStartingId(template.id);

    const { data, error: err } = await supabase
      .from("inspections")
      .insert({
        template_id: template.id,
        template_version: template.current_version,
        site_id: activeSiteId,
        company_id: activeMembership?.company_id || null,
        inspector_id: profile?.id,
        status: "draft",
      })
      .select()
      .single();

    setStartingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    onStarted(data.id);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">New Inspection</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        <Link
          href="/templates/new"
          className="flex items-center gap-2 border border-dashed border-slate-300 rounded-xl p-3 mb-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Plus size={16} /> Create a new template — it'll start automatically once saved
        </Link>

        {loading && <p className="text-sm text-slate-500">Loading templates...</p>}
        {!loading && templates.length === 0 && (
          <div className="text-center py-6">
            <ClipboardList className="mx-auto text-slate-300 mb-2" size={28} />
            <p className="text-sm text-slate-500">No existing templates yet.</p>
          </div>
        )}

        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between border border-slate-200 rounded-xl p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {t.category || "General"} · {t.template_items?.length || 0} items · v{t.current_version}
                </p>
              </div>
              <button
                onClick={() => startInspection(t)}
                disabled={startingId === t.id || !t.template_items?.length}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 shrink-0"
              >
                <PlayCircle size={14} />
                {startingId === t.id ? "Starting..." : "Start"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
