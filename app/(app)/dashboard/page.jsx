"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function DashboardPage() {
  const { activeSiteId, activeMembership } = useAuth();
  const [stats, setStats] = useState({ avgScore: null, raised: 0, closed: 0, open: 0 });
  const [scoreTrend, setScoreTrend] = useState([]);
  const [topIssues, setTopIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId, activeMembership?.company_id]);

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
      .select("value, template_items(question, category_tag), inspections!inner(site_id, company_id)")
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

    const counts = {};
    (failedAnswers || []).forEach((a) => {
      const label = a.template_items?.category_tag || a.template_items?.question || "Uncategorized";
      counts[label] = (counts[label] || 0) + 1;
    });
    const top = Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setTopIssues(top);

    setLoading(false);
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
