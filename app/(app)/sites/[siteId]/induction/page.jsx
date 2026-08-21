"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function SiteInductionSetupPage() {
  const { siteId } = useParams();
  const { canManageSite } = useAuth();
  const allowed = canManageSite(siteId);

  const [siteName, setSiteName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [templates, setTemplates] = useState([]);
  const [attached, setAttached] = useState([]); // rows from site_induction_declarations
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (allowed) load();
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
    setTemplates(templateData || []);
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

  if (!allowed) {
    return <main className="p-6 text-sm text-slate-500">You don't have permission to manage this site's induction settings.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Induction setup — {siteName}</h1>
        <p className="text-sm text-slate-500">
          The video and declarations someone sees when they request access to this site.
        </p>
      </div>

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
              Choose which standard declarations apply here. Wording is managed centrally — go to Qualifications in the nav to add new ones.
            </p>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              {templates.length === 0 && <p className="text-sm text-slate-400">No declaration templates exist yet — add some under Qualifications first.</p>}
              {templates.map((t) => {
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
    </main>
  );
}
