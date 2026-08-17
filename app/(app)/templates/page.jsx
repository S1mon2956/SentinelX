"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList, PlayCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function TemplatesPage() {
  const router = useRouter();
  const { profile, activeSiteId, activeMembership } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function startInspection(template) {
    setStartError("");
    setStartingId(template.id);

    const { data, error } = await supabase
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
    if (error) {
      setStartError(error.message);
      return;
    }
    router.push(`/inspections/${data.id}`);
  }

  async function load() {
    setLoading(true);
    // TODO: scope to the user's organization once multi-org support exists —
    // for now (single org, Sentinel/ISO Excellence) this loads everything
    // that hasn't been archived.
    const { data } = await supabase
      .from("templates")
      .select("id, name, category, current_version, archived_at, template_items(id)")
      .is("archived_at", null)
      .order("name");
    setTemplates(data || []);
    setLoading(false);
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Templates</h1>
        <Link
          href="/templates/new"
          className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
        >
          <Plus size={16} /> New template
        </Link>
      </div>

      {!activeSiteId && (
        <p className="text-sm text-slate-500 mb-4">
          Select a site from the switcher above to start an inspection.
        </p>
      )}

      {startError && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
          {startError}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && templates.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <ClipboardList className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm text-slate-500">No templates yet. Create your first one.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <Link href={`/templates/${t.id}`} className="block hover:opacity-80">
              <p className="font-semibold text-slate-800">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.category || "General"} · {t.template_items?.length || 0} items · v{t.current_version}
              </p>
            </Link>
            <button
              onClick={() => startInspection(t)}
              disabled={!activeSiteId || startingId === t.id || !t.template_items?.length}
              className="mt-3 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <PlayCircle size={14} />
              {startingId === t.id ? "Starting..." : "Start inspection"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
