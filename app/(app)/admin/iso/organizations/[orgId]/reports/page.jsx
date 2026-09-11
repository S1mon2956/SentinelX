"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

const REPORT_TYPES = ["internal", "external"];

function typeColor(type) {
  return type === "external" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700";
}

export default function IsoAuditReportsPage() {
  const { orgId } = useParams();
  const { isSuperAdmin, profile } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [form, setForm] = useState({ title: "", report_type: "internal", report_date: "", notes: "" });
  const [reportFile, setReportFile] = useState(null);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: reportsData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase
        .from("iso_audit_reports")
        .select("*, uploader:users!uploaded_by(full_name, email)")
        .eq("iso_organization_id", orgId)
        .order("report_date", { ascending: false }),
    ]);
    setOrgName(org?.name || "");
    setReports(reportsData || []);
    setLoading(false);
  }

  async function uploadReport(e) {
    e.preventDefault();
    if (!form.title.trim()) return alert("Give the report a title.");
    if (!reportFile) return alert("Choose a file to upload.");

    setUploading(true);

    // Upload first, then insert the row with the resulting path — a
    // storage failure (network/size/permission) must never leave behind a
    // DB row pointing at a file that was never actually saved.
    const path = `${orgId}/${crypto.randomUUID()}/${reportFile.name}`;
    const { error: uploadError } = await supabase.storage.from("iso-audit-reports").upload(path, reportFile);
    if (uploadError) {
      setUploading(false);
      alert(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { error: insertError } = await supabase.from("iso_audit_reports").insert({
      iso_organization_id: orgId,
      title: form.title.trim(),
      report_type: form.report_type,
      report_date: form.report_date || null,
      file_path: path,
      notes: form.notes.trim() || null,
      uploaded_by: profile?.id || null,
    });

    setUploading(false);

    if (insertError) {
      alert(`Report record failed to save: ${insertError.message}`);
      return;
    }

    setForm({ title: "", report_type: "internal", report_date: "", notes: "" });
    setReportFile(null);
    load();
  }

  async function viewReport(report) {
    setViewingId(report.id);
    const { data, error } = await supabase.storage.from("iso-audit-reports").createSignedUrl(report.file_path, 3600);
    setViewingId(null);
    if (error || !data?.signedUrl) {
      alert(`Couldn't open this report: ${error?.message || "no signed URL returned"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — audit reports</h1>
        <p className="text-sm text-slate-500">Historic internal/external audit report uploads for this client.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            {reports.length === 0 && <p className="text-sm text-slate-400">No reports uploaded yet.</p>}
            {reports.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {r.report_date || "No date"} · {r.uploader?.full_name || r.uploader?.email || "Unknown uploader"}
                  </p>
                  {r.notes && <p className="text-xs text-slate-400">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${typeColor(r.report_type)}`}>
                    {r.report_type}
                  </span>
                  <button
                    onClick={() => viewReport(r)}
                    disabled={viewingId === r.id}
                    className="text-xs font-medium text-indigo-600 underline disabled:opacity-50"
                  >
                    {viewingId === r.id ? "Opening..." : "View"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={uploadReport} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Upload a report</h2>
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="col-span-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={form.report_type}
                onChange={(e) => setForm((p) => ({ ...p, report_type: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.report_date}
                onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="file"
                onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={uploading}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload report"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
