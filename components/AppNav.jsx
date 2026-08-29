"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import SiteSwitcher from "@/components/SiteSwitcher";
import NotificationBell from "@/components/NotificationBell";

// ISO Excellence is a separate product, not an internal page — once it has
// its own platform, this is the only line that needs to change.
const ISO_EXCELLENCE_HREF = "/admin/iso";

export default function AppNav() {
  const pathname = usePathname();
  const { profile, memberships, canApproveUsers, canManageSite, isSuperAdmin, activeSiteId, setActiveSiteId, membershipError, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Workspace switcher: the primary logo label reflects whichever product
  // section you're currently in, with a small link back to the other.
  const inIsoSection = pathname.startsWith(ISO_EXCELLENCE_HREF);

  // Deliberately narrower than canManageSite: only a full site manager or a
  // super admin can manage external reviewers, matching the phase26 INSERT
  // policy — a company manager can't add a site-wide reviewer.
  const canManageReviewers =
    activeSiteId && (isSuperAdmin || memberships.some((m) => m.site_id === activeSiteId && m.role === "site_manager"));

  // Risk Heatmap folded into Dashboard, Templates into Inspections, and
  // Qualifications/Approvals/Induction Setup all folded into the per-site
  // Inductions page — see app/(app)/sites/[siteId]/induction/page.jsx.
  const sentinelLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/inspections", label: "Inspections" },
    { href: "/observations", label: "Observations" },
    { href: "/assets", label: "Assets" },
    { href: "/incidents", label: "Incidents" },
    ...(isSuperAdmin ? [{ href: "/organization", label: "Organisation" }] : []),
    ...(activeSiteId && (canManageSite(activeSiteId) || isSuperAdmin)
      ? [{ href: `/sites/${activeSiteId}/induction`, label: "Inductions" }]
      : []),
    ...(canManageReviewers ? [{ href: `/sites/${activeSiteId}/reviewers`, label: "External Reviewers" }] : []),
  ];

  // ISO Excellence is its own product with its own nav — only the pages
  // that actually exist today, not a placeholder for the fuller feature set
  // it'll eventually grow into.
  const isoLinks = [
    { href: ISO_EXCELLENCE_HREF, label: "Clients" },
    { href: `${ISO_EXCELLENCE_HREF}/templates`, label: "Template Library" },
    { href: `${ISO_EXCELLENCE_HREF}/checklists`, label: "Checklist Library" },
  ];

  const links = inIsoSection ? isoLinks : sentinelLinks;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          {/* Hamburger — switches to the slide-out menu earlier (below xl
              instead of lg) so the full link row never has to cram against
              the site switcher before there's room for it. */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="xl:hidden flex items-center justify-center min-w-[44px] min-h-[44px] -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div className="flex flex-col shrink-0 leading-tight">
            <Link href={inIsoSection ? ISO_EXCELLENCE_HREF : "/dashboard"} className="text-lg font-semibold text-slate-800">
              {inIsoSection ? "ISO Excellence" : "SentinelX"}
            </Link>
            {isSuperAdmin && (
              <Link
                href={inIsoSection ? "/dashboard" : ISO_EXCELLENCE_HREF}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 hover:text-indigo-700 w-fit"
              >
                {inIsoSection ? "SentinelX" : "ISO Excellence"}
                {!inIsoSection && <ExternalLink size={9} />}
              </Link>
            )}
          </div>

          {/* Full horizontal nav — desktop only */}
          <nav className="hidden xl:flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  pathname === l.href ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Site switcher hidden on the narrowest screens — it reappears in
              the slide-out menu below, so it's never actually unreachable. */}
          <div className="hidden sm:block">
            <SiteSwitcher
              memberships={memberships}
              activeSiteId={activeSiteId}
              onChange={setActiveSiteId}
              error={membershipError}
            />
          </div>
          <span className="text-sm text-slate-500 hidden xl:inline">
            {profile?.full_name || profile?.email}
          </span>
          <NotificationBell />
          <button
            onClick={signOut}
            className="hidden xl:flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Slide-out mobile menu — a left-anchored drawer over a dismissible
          backdrop, rather than a full-width panel that covers the page.
          Always mounted (not menuOpen &&) so the translate-x transition can
          actually animate in both directions; visibility/hit-testing are
          controlled by the classes instead. */}
      <div
        className={`xl:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />

        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl overflow-y-auto transition-transform duration-200 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Site switcher lives here on mobile, where it's hidden from the bar */}
          <div className="sm:hidden p-3 border-b border-slate-100">
            <SiteSwitcher
              memberships={memberships}
              activeSiteId={activeSiteId}
              onChange={(id) => {
                setActiveSiteId(id);
                setMenuOpen(false);
              }}
              error={membershipError}
            />
          </div>

          <nav className="flex flex-col p-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`px-4 min-h-[48px] flex items-center rounded-lg text-base font-medium ${
                  pathname === l.href ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {isSuperAdmin && (
            <div className="px-4 pb-2">
              <Link
                href={inIsoSection ? "/dashboard" : ISO_EXCELLENCE_HREF}
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-600"
              >
                {inIsoSection ? "SentinelX" : "ISO Excellence"}
                {!inIsoSection && <ExternalLink size={11} />}
              </Link>
            </div>
          )}

          <div className="p-2 border-t border-slate-100">
            <p className="px-4 py-1 text-xs text-slate-400">{profile?.full_name || profile?.email}</p>
            <button
              onClick={signOut}
              className="w-full px-4 min-h-[48px] flex items-center gap-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut size={18} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
