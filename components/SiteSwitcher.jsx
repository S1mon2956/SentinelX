"use client";

import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

// Expects `memberships`: the current user's approved site_memberships rows
// (joined with site name), fetched server-side and passed in as a prop.
// Super admins get every site instead of just their memberships — resolve
// that in the query that loads this component, not here.
export default function SiteSwitcher({ memberships = [], activeSiteId, onChange, error = "" }) {
  const [open, setOpen] = useState(false);
  const active = memberships.find((m) => m.site_id === activeSiteId) || memberships[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50"
      >
        <MapPin size={16} className="text-slate-500" />
        {active ? active.site_name : "Select a site"}
        <ChevronDown size={16} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-72 overflow-auto">
          {error && (
            <p className="p-3 text-sm text-rose-600">
              Couldn't load your sites: {error}
            </p>
          )}
          {!error && memberships.length === 0 && (
            <p className="p-3 text-sm text-slate-500">
              You're not approved for any sites yet.
            </p>
          )}
          {memberships.map((m) => (
            <button
              key={m.site_id}
              onClick={() => {
                onChange(m.site_id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                m.site_id === activeSiteId ? "bg-slate-100 font-medium" : ""
              }`}
            >
              <span>{m.site_name}</span>
              <span className="text-xs text-slate-400 capitalize">{m.role.replace("_", " ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
