"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import IsoTutorialOverlay from "@/components/IsoTutorialOverlay";

const TUTORIAL_SLIDES = [
  {
    title: "Welcome to ISO Excellence",
    paragraphs: [
      "This is your list of clients — every company you're building or maintaining an ISO management system for.",
      "Each row shows which standards a client is enrolled in (or \"Not enrolled\" if they haven't started yet).",
    ],
  },
  {
    title: "Adding a client",
    paragraphs: [
      "Type a name below and hit \"Add client\" to create one. It starts unenrolled — you pick which standard(s) to enroll it in from its own page.",
      "Click any client in the list to open their document register, audits, actions, risks, contractors, and equipment.",
    ],
  },
  {
    title: "The template library",
    paragraphs: [
      "\"Manage template library\" (top right) is where you build reusable policy/procedure wording, shared across every client — start there before adding clients if you're setting this up from scratch.",
    ],
  },
];

export default function IsoOrganizationsPage() {
  const { isSuperAdmin } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("iso_organizations")
      .select("*, iso_organization_standards(standard:iso_standards(code, name))")
      .order("name");
    setOrganizations(data || []);
    setLoading(false);
  }

  async function addOrganization(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await supabase.from("iso_organizations").insert({ name: newName.trim() });
    if (error) return alert(error.message);
    setNewName("");
    load();
  }

  if (!isSuperAdmin) {
    return <main className="p-6 text-sm text-slate-500">This page is only available to Super Admins.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800 mb-1">ISO Excellence</h1>
            <button
              onClick={() => setTutorialOpen(true)}
              aria-label="Show tutorial"
              className="text-slate-400 hover:text-slate-600 mb-1"
            >
              <HelpCircle size={18} />
            </button>
          </div>
          <p className="text-sm text-slate-500">Clients you're building or maintaining an ISO management system for.</p>
        </div>
        <Link href="/admin/iso/templates" className="text-sm text-indigo-600 underline shrink-0">
          Manage template library
        </Link>
      </div>

      <IsoTutorialOverlay open={tutorialOpen} onClose={() => setTutorialOpen(false)} slides={TUTORIAL_SLIDES} />

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            {organizations.length === 0 && <p className="text-sm text-slate-400">No ISO clients yet.</p>}
            {organizations.map((o) => {
              const standards = (o.iso_organization_standards || []).map((s) => s.standard).filter(Boolean);
              return (
                <Link
                  key={o.id}
                  href={`/admin/iso/organizations/${o.id}`}
                  className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0 hover:bg-slate-50 -mx-2 px-2 rounded"
                >
                  <span className="text-slate-800 font-medium">{o.name}</span>
                  <span className="flex flex-wrap gap-1 justify-end">
                    {standards.length === 0 && <span className="text-xs text-slate-400">Not enrolled</span>}
                    {standards.map((s) => (
                      <span
                        key={s.code}
                        className="text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5 uppercase"
                      >
                        ISO {s.code}
                      </span>
                    ))}
                  </span>
                </Link>
              );
            })}
          </div>

          <form onSubmit={addOrganization} className="flex gap-2">
            <input
              placeholder="Client name, e.g. Acme Roofing Ltd"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              Add client
            </button>
          </form>
        </>
      )}
    </main>
  );
}
