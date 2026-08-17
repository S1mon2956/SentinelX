"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const CATEGORIES = [
  {
    key: "observation_assigned",
    label: "An observation is assigned to me",
    description: "Someone hands you a corrective action to close out.",
  },
  {
    key: "inspection_submitted",
    label: "An inspection needs my review",
    description: "Shown to site/company managers when an inspection is submitted on their site.",
  },
  {
    key: "inspection_approved",
    label: "My inspection was approved",
    description: "Lets you know when a manager signs off on something you submitted.",
  },
];

export default function NotificationSettingsPage() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) load();
  }, [profile?.id]);

  async function load() {
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle();

    setPrefs(
      data || {
        user_id: profile.id,
        observation_assigned: true,
        inspection_submitted: true,
        inspection_approved: true,
        email_enabled: true,
      }
    );
  }

  async function toggle(key) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    await supabase.from("notification_preferences").upsert(updated);
    setSaving(false);
  }

  if (!prefs) return <main className="p-6 text-sm text-slate-500">Loading...</main>;

  return (
    <main className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Notification settings</h1>
      <p className="text-sm text-slate-500 mb-6">
        Choose what you want to hear about, and whether it also reaches your inbox.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium text-slate-800">Also send these by email</p>
          <p className="text-xs text-slate-500 mt-0.5">Turn off to keep everything in-app only.</p>
        </div>
        <button
          onClick={() => toggle("email_enabled")}
          disabled={saving}
          className={`shrink-0 w-10 h-6 rounded-full transition ${prefs.email_enabled ? "bg-emerald-500" : "bg-slate-300"}`}
        >
          <span
            className={`block w-4 h-4 bg-white rounded-full shadow transform transition ${
              prefs.email_enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center justify-between p-4">
            <div className="pr-4">
              <p className="text-sm font-medium text-slate-800">{c.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
            </div>
            <button
              onClick={() => toggle(c.key)}
              disabled={saving}
              className={`shrink-0 w-10 h-6 rounded-full transition ${prefs[c.key] ? "bg-emerald-500" : "bg-slate-300"}`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full shadow transform transition ${
                  prefs[c.key] ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
