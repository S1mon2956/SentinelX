"use client";

import { useEffect, useState } from "react";
import { Plus, AlertTriangle, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { INCIDENT_CATEGORIES } from "@/lib/incidentConstants";
import { getLocation } from "@/lib/geolocation";

const CATEGORY_LABEL = Object.fromEntries(INCIDENT_CATEGORIES.map((c) => [c.value, c.label]));

export default function IncidentsPage() {
  const { profile, activeSiteId, activeMembership } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reporting, setReporting] = useState(false);
  const [category, setCategory] = useState(INCIDENT_CATEGORIES[0].value);
  const [description, setDescription] = useState("");
  const [reportError, setReportError] = useState("");
  const [includeLocation, setIncludeLocation] = useState(false);

  useEffect(() => {
    if (activeSiteId) load();
  }, [activeSiteId]);

  async function load() {
    setLoading(true);
    setError("");

    let query = supabase
      .from("incidents")
      .select("id, category, description, created_at, users:reported_by(full_name, email)")
      .eq("site_id", activeSiteId)
      .order("created_at", { ascending: false });

    if (activeMembership?.role === "company_manager" && activeMembership.company_id) {
      query = query.eq("company_id", activeMembership.company_id);
    }

    const { data, error: loadErr } = await query;
    if (loadErr) {
      setError(loadErr.message);
    } else {
      setIncidents(data || []);
    }
    setLoading(false);
  }

  async function handleReport() {
    setReportError("");
    if (!description.trim()) {
      setReportError("Describe what happened.");
      return;
    }

    const location = includeLocation ? await getLocation() : null;

    const { error: insertErr } = await supabase.from("incidents").insert({
      site_id: activeSiteId,
      company_id: activeMembership?.company_id || null,
      reported_by: profile?.id,
      category,
      description: description.trim(),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    });

    if (insertErr) {
      setReportError(insertErr.message);
      return;
    }

    setReporting(false);
    setCategory(INCIDENT_CATEGORIES[0].value);
    setDescription("");
    load();
  }

  if (!activeSiteId) {
    return <main className="p-6 text-sm text-slate-500">Select a site from the switcher above.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Incidents</h1>
        {!reporting && (
          <button
            onClick={() => setReporting(true)}
            className="flex items-center gap-1 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-800"
          >
            <Plus size={16} /> Report incident
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {reporting && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          {reportError && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {reportError}
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-slate-500">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {INCIDENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="What happened?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer w-fit">
            <input type="checkbox" checked={includeLocation} onChange={(e) => setIncludeLocation(e.target.checked)} />
            <MapPin size={13} /> Include my current location
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleReport}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Submit report
            </button>
            <button
              onClick={() => {
                setReporting(false);
                setReportError("");
                setDescription("");
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading...</p>}
      {!loading && incidents.length === 0 && (
        <p className="text-sm text-slate-500">No incidents reported for this site.</p>
      )}

      <div className="space-y-3">
        {incidents.map((inc) => (
          <div key={inc.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                <AlertTriangle size={14} className="text-amber-500" />
                {CATEGORY_LABEL[inc.category] || inc.category}
              </p>
              <span className="text-xs text-slate-400">
                {new Date(inc.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-slate-600">{inc.description}</p>
            <p className="text-xs text-slate-400 mt-1">
              Reported by {inc.users?.full_name || inc.users?.email || "unknown"}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
