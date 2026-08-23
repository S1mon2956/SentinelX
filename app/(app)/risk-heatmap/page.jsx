"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const DAYS_60 = 60 * 24 * 60 * 60 * 1000;

function scoreColor(score) {
  if (score == null) return "bg-slate-100 text-slate-400";
  if (score >= 85) return "bg-emerald-100 text-emerald-700";
  if (score >= 70) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function countColor(n, amberAt, redAt) {
  if (n >= redAt) return "bg-rose-100 text-rose-700";
  if (n >= amberAt) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function RiskHeatmapPage() {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const now = Date.now();

    const [{ data: sites }, { data: inspections }, { data: observations }, { data: assets }, { data: incidents }, { data: failedAnswers }] =
      await Promise.all([
        supabase.from("sites").select("id, name, clients(name)").is("archived_at", null),
        supabase.from("inspections").select("site_id, score, submitted_at").not("score", "is", null),
        supabase.from("observations").select("site_id, status"),
        supabase.from("assets").select("site_id, thorough_exam_expiry").is("archived_at", null),
        supabase.from("incidents").select("site_id, created_at"),
        supabase
          .from("answers")
          .select("value, template_items(issue_categories(label)), inspections!inner(site_id)")
          .eq("value", "fail"),
      ]);

    const computed = (sites || []).map((site) => {
      const siteInspections = (inspections || []).filter((i) => i.site_id === site.id);
      const avgScore = siteInspections.length
        ? Math.round(siteInspections.reduce((s, i) => s + i.score, 0) / siteInspections.length)
        : null;

      const openObservations = (observations || []).filter((o) => o.site_id === site.id && o.status === "open").length;

      const siteAssets = (assets || []).filter((a) => a.site_id === site.id);
      const expiredCerts = siteAssets.filter((a) => a.thorough_exam_expiry && new Date(a.thorough_exam_expiry).getTime() < now).length;
      const expiringCerts = siteAssets.filter((a) => {
        if (!a.thorough_exam_expiry) return false;
        const t = new Date(a.thorough_exam_expiry).getTime();
        return t >= now && t < now + DAYS_60;
      }).length;

      const recentIncidents = (incidents || []).filter(
        (inc) => inc.site_id === site.id && now - new Date(inc.created_at).getTime() < DAYS_30
      ).length;

      // Repeat offender: most common failed category on this site. Grouped
      // by the controlled category picklist only, same as the dashboard —
      // no fallback to raw question text.
      const tagCounts = {};
      (failedAnswers || [])
        .filter((a) => a.inspections?.site_id === site.id)
        .forEach((a) => {
          const tag = a.template_items?.issue_categories?.label || "Uncategorized";
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      const topIssue = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // A rough combined risk score, purely to sort the table so the
      // worst sites float to the top — not shown directly, just used for ordering.
      const riskScore =
        (avgScore != null ? 100 - avgScore : 50) + openObservations * 3 + expiredCerts * 10 + expiringCerts * 3 + recentIncidents * 5;

      return {
        id: site.id,
        name: site.name,
        client: site.clients?.name,
        avgScore,
        openObservations,
        expiredCerts,
        expiringCerts,
        recentIncidents,
        topIssue,
        riskScore,
      };
    });

    computed.sort((a, b) => b.riskScore - a.riskScore);
    setRows(computed);
    setLoading(false);
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Risk heatmap</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every site you oversee, sorted with the highest-risk sites first — problem locations and repeat issues at a glance.
      </p>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-slate-500">No sites yet.</p>}

      {!loading && rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Site</th>
                <th className="text-center px-3 py-2">Avg score</th>
                <th className="text-center px-3 py-2">Open obs.</th>
                <th className="text-center px-3 py-2">Expired certs</th>
                <th className="text-center px-3 py-2">Expiring soon</th>
                <th className="text-center px-3 py-2">Incidents (30d)</th>
                <th className="text-left px-3 py-2">Top recurring issue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.client}</p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block min-w-[48px] px-2 py-1 rounded-full font-semibold ${scoreColor(r.avgScore)}`}>
                      {r.avgScore != null ? `${r.avgScore}%` : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block min-w-[32px] px-2 py-1 rounded-full font-semibold ${countColor(r.openObservations, 3, 8)}`}>
                      {r.openObservations}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block min-w-[32px] px-2 py-1 rounded-full font-semibold ${countColor(r.expiredCerts, 1, 2)}`}>
                      {r.expiredCerts}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block min-w-[32px] px-2 py-1 rounded-full font-semibold ${countColor(r.expiringCerts, 2, 5)}`}>
                      {r.expiringCerts}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block min-w-[32px] px-2 py-1 rounded-full font-semibold ${countColor(r.recentIncidents, 1, 3)}`}>
                      {r.recentIncidents}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {r.topIssue ? (
                      <span className="flex items-center gap-1">
                        <AlertTriangle size={12} className="text-amber-500" /> {r.topIssue}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
