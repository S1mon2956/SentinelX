"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import SiteSwitcher from "@/components/SiteSwitcher";
import NotificationBell from "@/components/NotificationBell";

export default function AppNav() {
  const pathname = usePathname();
  const { profile, memberships, canApproveUsers, canManageSite, isSuperAdmin, activeSiteId, setActiveSiteId, membershipError, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Deliberately narrower than canManageSite: only a full site manager or a
  // super admin can manage external reviewers, matching the phase26 INSERT
  // policy — a company manager can't add a site-wide reviewer.
  const canManageReviewers =
    activeSiteId && (isSuperAdmin || memberships.some((m) => m.site_id === activeSiteId && m.role === "site_manager"));

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/templates", label: "Templates" },
    { href: "/inspections", label: "Inspections" },
    { href: "/observations", label: "Observations" },
    { href: "/assets", label: "Assets" },
    { href: "/incidents", label: "Incidents" },
    ...(isSuperAdmin
      ? [
          { href: "/organization", label: "Organisation" },
          { href: "/risk-heatmap", label: "Risk Heatmap" },
          { href: "/admin/qualifications", label: "Qualifications" },
          { href: "/admin/iso", label: "ISO Excellence" },
        ]
      : []),
    ...(canApproveUsers ? [{ href: "/admin/approvals", label: "Approvals" }] : []),
    ...(activeSiteId && canManageSite(activeSiteId)
      ? [{ href: `/sites/${activeSiteId}/induction`, label: "Induction Setup" }]
      : []),
    ...(canManageReviewers ? [{ href: `/sites/${activeSiteId}/reviewers`, label: "External Reviewers" }] : []),
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          {/* Hamburger — mobile only. min-h/w 44px is the accepted minimum
              touch target size; matters a lot with gloves on. */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <span className="text-lg font-semibold text-slate-800 shrink-0">SentinelX</span>

          {/* Full horizontal nav — desktop only */}
          <nav className="hidden lg:flex gap-1">
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
            className="hidden lg:flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Slide-out mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white">
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
      )}
    </header>
  );
}
