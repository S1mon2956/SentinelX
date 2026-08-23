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

export default function DashboardPage() {
  const { activeSiteId, activeMembership, isSuperAdmin } = useAuth();
  const [stats, setStats] = useState({ avgScore: null, raised: 0, closed: 0, open: 0 });
  const [scoreTrend, setScoreTrend] = useState([]);
  const [topIssues, setTopIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [heatmapRows, setHeatmapRows] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId, activeMembership?.company_id]);

  useEffect(() => {
    if (isSuperAdmin) loadHeatmap();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    setError("");

    let inspectionsQuery = supabase
      .from("inspections")
      .select("score, submitted_at")
      .eq("site_id", activeSiteId)
      .not("score", "is", null)
      .order("submitted_at");

    let observationsQuery = supabase.from("observations").select("status").eq("site_id", activeSiteId);

    let failedAnswersQuery = supabase
      .from("answers")
      .select("value, template_items(issue_categories(label)), inspections!inner(site_id, company_id)")
      .eq("value", "fail")
      .eq("inspections.site_id", activeSiteId);

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      inspectionsQuery = inspectionsQuery.eq("company_id", activeMembership.company_id);
      observationsQuery = observationsQuery.eq("company_id", activeMembership.company_id);
      failedAnswersQuery = failedAnswersQuery.eq("inspections.company_id", activeMembership.company_id);
    }

    const [
      { data: inspections, error: inspErr },
      { data: observations, error: obsErr },
      { data: failedAnswers, error: failErr },
    ] = await Promise.all([inspectionsQuery, observationsQuery, failedAnswersQuery]);

    if (inspErr || obsErr || failErr) {
      setError(inspErr?.message || obsErr?.message || failErr?.message);
      setLoading(false);
      return;
    }

    const scores = (inspections || []).map((i) => i.score).filter((s) => s != null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const closed = (observations || []).filter((o) => o.status === "closed").length;
    const open = (observations || []).filter((o) => o.status === "open").length;
    setStats({ avgScore, raised: (observations || []).length, closed, open });

    const byMonth = {};
    (inspections || []).forEach((i) => {
      const d = new Date(i.submitted_at);
      const key = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(i.score);
    });
    const trend = Object.entries(byMonth)
      .map(([label, vals]) => ({ label, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
      .slice(-6);
    setScoreTrend(trend);

    // Grouped by the controlled category picklist only — no falling back to
    // raw question text, since that's exactly what let free-text typos
    // fragment the same issue into separate buckets.
    const counts = {};
    (failedAnswers || []).forEach((a) => {
      const label = a.template_items?.issue_categories?.label || "Uncategorized";
      counts[label] = (counts[label] || 0) + 1;
    });
    const top = Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setTopIssues(top);

    setLoading(false);
  }

  async function loadHeatmap() {
    setHeatmapLoading(true);
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
    setHeatmapRows(computed);
    setHeatmapLoading(false);
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Avg audit score"
          value={loading ? "…" : stats.avgScore != null ? `${stats.avgScore}%` : "—"}
        />
        <StatCard label="Observations raised" value={loading ? "…" : stats.raised} />
        <StatCard label="Closed" value={loading ? "…" : stats.closed} />
        <StatCard label="Open" value={loading ? "…" : stats.open} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Average score over time">
          {!loading && scoreTrend.length === 0 && <EmptyNote text="No scored inspections yet." />}
          {scoreTrend.length > 0 && <ScoreTrendChart data={scoreTrend} />}
        </ChartCard>

        <ChartCard title="Top 5 recurring issues">
          {!loading && topIssues.length === 0 && <EmptyNote text="No failed items yet — nothing recurring to show." />}
          {topIssues.length > 0 && <TopIssuesChart data={topIssues} />}
        </ChartCard>
      </div>

      <ChartCard title="Observation status">
        {!loading && stats.raised === 0 && <EmptyNote text="No observations raised yet." />}
        {stats.raised > 0 && <StatusSplit open={stats.open} closed={stats.closed} />}
      </ChartCard>

      {isSuperAdmin && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Risk heatmap</h2>
          <p className="text-xs text-slate-500 mb-3">
            Every site you oversee, sorted with the highest-risk sites first — problem locations and repeat issues at a glance.
          </p>

          {heatmapLoading && <p className="text-sm text-slate-500">Loading...</p>}
          {!heatmapLoading && heatmapRows.length === 0 && <p className="text-sm text-slate-500">No sites yet.</p>}

          {!heatmapLoading && heatmapRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
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
                  {heatmapRows.map((r) => (
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
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  );
}

function EmptyNote({ text }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{text}</p>;
}

function ScoreTrendChart({ data }) {
  const width = 400;
  const height = 160;
  const pad = 24;
  const max = 100;
  const min = 0;

  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((d.avg - min) / (max - min)) * (height - pad * 2);
    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
      {[0, 50, 100].map((v) => {
        const y = height - pad - ((v - min) / (max - min)) * (height - pad * 2);
        return (
          <line key={v} x1={pad} x2={width - pad} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
        );
      })}
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
          <text x={p.x} y={height - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">
            {p.label}
          </text>
          <text x={p.x} y={p.y - 8} fontSize="9" textAnchor="middle" fill="#475569">
            {p.avg}%
          </text>
        </g>
      ))}
    </svg>
  );
}

function TopIssuesChart({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span className="truncate pr-2">{d.label}</span>
            <span className="shrink-0">{d.count}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusSplit({ open, closed }) {
  const total = open + closed;
  const openPct = total ? Math.round((open / total) * 100) : 0;
  return (
    <div>
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100 mb-2">
        <div className="h-full bg-emerald-600" style={{ width: `${100 - openPct}%` }} />
        <div className="h-full bg-amber-500" style={{ width: `${openPct}%` }} />
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Closed — {closed} ({100 - openPct}%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Open — {open} ({openPct}%)
        </span>
      </div>
    </div>
  );
}
