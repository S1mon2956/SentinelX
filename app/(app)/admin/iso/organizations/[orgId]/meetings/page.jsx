"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoClientTabs from "@/components/IsoClientTabs";

export default function IsoMeetingsPage() {
  const { orgId } = useParams();
  const { isSuperAdmin } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editMinutes, setEditMinutes] = useState({});
  const [form, setForm] = useState({ title: "", meeting_date: "", attendees: "", minutes: "" });

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, orgId]);

  async function load() {
    setLoading(true);
    const [{ data: org }, { data: meetingsData }] = await Promise.all([
      supabase.from("iso_organizations").select("*").eq("id", orgId).single(),
      supabase.from("iso_meetings").select("*").eq("iso_organization_id", orgId).order("meeting_date", { ascending: false }),
    ]);
    setOrgName(org?.name || "");
    setMeetings(meetingsData || []);
    setEditMinutes((prev) => {
      const next = { ...prev };
      (meetingsData || []).forEach((m) => {
        if (!(m.id in next)) next[m.id] = m.minutes || "";
      });
      return next;
    });
    setLoading(false);
  }

  async function addMeeting(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.meeting_date) return;
    const { error } = await supabase.from("iso_meetings").insert({
      iso_organization_id: orgId,
      title: form.title.trim(),
      meeting_date: form.meeting_date,
      attendees: form.attendees.trim() || null,
      minutes: form.minutes.trim() || null,
    });
    if (error) return alert(error.message);
    setForm({ title: "", meeting_date: "", attendees: "", minutes: "" });
    load();
  }

  async function saveMinutes(id) {
    const { error } = await supabase.from("iso_meetings").update({ minutes: editMinutes[id] || null }).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">{orgName || "..."} — meetings</h1>
        <p className="text-sm text-slate-500">Meeting log for this client, with attendees and minutes.</p>
      </div>

      <IsoClientTabs orgId={orgId} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="space-y-3">
            {meetings.length === 0 && <p className="text-sm text-slate-400">No meetings logged yet — add one below.</p>}
            {meetings.map((m) => (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.title}</p>
                    <p className="text-xs text-slate-500">
                      {m.meeting_date}
                      {m.attendees ? ` · ${m.attendees}` : ""}
                    </p>
                    {m.minutes && expandedId !== m.id && (
                      <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap line-clamp-2">{m.minutes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    className="text-xs font-medium text-indigo-600 underline shrink-0"
                  >
                    {expandedId === m.id ? "Close" : "View/Edit minutes"}
                  </button>
                </div>

                {expandedId === m.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <textarea
                      value={editMinutes[m.id] || ""}
                      onChange={(e) => setEditMinutes((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      rows={8}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => saveMinutes(m.id)}
                      className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
                    >
                      Save minutes
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={addMeeting} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Add a meeting</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.meeting_date}
                onChange={(e) => setForm((p) => ({ ...p, meeting_date: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <input
              placeholder="Attendees"
              value={form.attendees}
              onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Minutes (optional)"
              value={form.minutes}
              onChange={(e) => setForm((p) => ({ ...p, minutes: e.target.value }))}
              rows={4}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add meeting
            </button>
          </form>
        </>
      )}
    </main>
  );
}
