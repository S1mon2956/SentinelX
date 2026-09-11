"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AuthContext = createContext(null);

// Routes anyone can reach without being logged in.
const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function AuthProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // row from `users`
  const [memberships, setMemberships] = useState([]); // approved site_memberships, joined with site name
  const [activeSiteId, setActiveSiteId] = useState(null); // the site currently selected in the SiteSwitcher
  const [membershipError, setMembershipError] = useState(""); // surfaced instead of silently showing zero sites
  const [isoMemberships, setIsoMemberships] = useState([]); // approved iso_organization_memberships, joined with org name
  const [hasAnySiteMembershipRecord, setHasAnySiteMembershipRecord] = useState(false); // any APPROVED site_memberships row — mirrors how hasIsoAccess is scoped to approved iso memberships

  useEffect(() => {
    let active = true;

    async function loadProfileAndMemberships(userId) {
      const { data: profileData, error: profileErr } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();
      if (!active) return;
      if (profileErr) console.error("Failed to load user profile:", profileErr.message);
      setProfile(profileData);

      // Super admins aren't scoped to specific site_memberships — they get
      // every non-archived site instead of just what they've been approved for.
      let mapped;
      let membershipErr = null;
      let isoMembershipRows = [];
      let anySiteMembership = false;
      if (profileData?.is_super_admin) {
        const { data: siteData, error: siteErr } = await supabase
          .from("sites")
          .select("id, name")
          .is("archived_at", null);
        membershipErr = siteErr;
        mapped = (siteData || []).map((s) => ({
          id: `super-admin-${s.id}`,
          role: "super_admin",
          status: "approved",
          site_id: s.id,
          company_id: null,
          site_name: s.name || "Unnamed site",
        }));
      } else {
        const [{ data: membershipData, error: mErr }, { data: isoData }, { count: siteCount }] = await Promise.all([
          supabase
            .from("site_memberships")
            .select("id, role, status, site_id, company_id, sites(name)")
            .eq("user_id", userId)
            .eq("status", "approved"),
          supabase
            .from("iso_organization_memberships")
            .select("id, role, status, iso_organization_id, iso_organizations(name)")
            .eq("user_id", userId)
            .eq("status", "approved"),
          supabase
            .from("site_memberships")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "approved"),
        ]);
        membershipErr = mErr;
        mapped = (membershipData || []).map((m) => ({
          ...m,
          site_name: m.sites?.name || "Unnamed site",
        }));
        isoMembershipRows = isoData || [];
        anySiteMembership = (siteCount || 0) > 0;
      }
      if (!active) return;
      if (membershipErr) {
        console.error("Failed to load site memberships:", membershipErr.message);
        setMembershipError(membershipErr.message);
      } else {
        setMembershipError("");
      }
      setMemberships(mapped);
      setIsoMemberships(isoMembershipRows);
      setHasAnySiteMembershipRecord(profileData?.is_super_admin ? true : anySiteMembership);
      setActiveSiteId((current) => current ?? mapped[0]?.site_id ?? null);
    }

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setSession(sessionData.session);

      if (sessionData.session) {
        await loadProfileAndMemberships(sessionData.session.user.id);
      }

      if (active) setLoading(false);
    }

    init();

    // Handles sign-in/sign-out that happen without a full page reload (e.g.
    // logging back in from /login via the SPA) — without this, profile and
    // memberships stay stuck at whatever they were cleared to on sign-out.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setMemberships([]);
        setIsoMemberships([]);
        setHasAnySiteMembershipRecord(false);
        setActiveSiteId(null);
      } else {
        loadProfileAndMemberships(newSession.user.id);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Route guard: bounce logged-out users to /login (except on public routes),
  // and bounce logged-in users away from /login and /register.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/join/");

    if (!session && !isPublic) {
      router.replace("/login");
    }
    // /reset-password is exempt: Supabase's recovery link signs the user in
    // via the URL fragment before they've actually set a new password, so
    // bouncing on `session` here would boot them to /dashboard mid-reset.
    if (session && isPublic && pathname !== "/reset-password" && !pathname.startsWith("/join/")) {
      router.replace("/dashboard");
    }
  }, [loading, session, pathname, router]);

  const isSuperAdmin = !!profile?.is_super_admin;
  const isManagerSomewhere = memberships.some(
    (m) => m.role === "site_manager" || m.role === "company_manager"
  );
  // Used by AppNav to decide whether the ISO Excellence / SentinelX
  // workspace-switcher badge should be offered at all, independent of
  // is_super_admin — a client-facing ISO member with zero site_memberships
  // rows should never be shown a "SentinelX" option that leads nowhere.
  const hasIsoAccess = isSuperAdmin || isoMemberships.length > 0;
  const hasSentinelAccess = isSuperAdmin || hasAnySiteMembershipRecord;
  // Someone with real work to do: a super admin, or a manager on at least one site.
  const canApproveUsers = isSuperAdmin || isManagerSomewhere;
  function canManageSite(siteId) {
    if (isSuperAdmin) return true;
    return memberships.some(
      (m) => m.site_id === siteId && (m.role === "site_manager" || m.role === "company_manager")
    );
  }
  const activeMembership = memberships.find((m) => m.site_id === activeSiteId) || null;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        profile,
        memberships,
        isSuperAdmin,
        canApproveUsers,
        canManageSite,
        activeSiteId,
        setActiveSiteId,
        activeMembership,
        membershipError,
        isoMemberships,
        hasIsoAccess,
        hasSentinelAccess,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
