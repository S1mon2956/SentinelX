"use client";

import { useAuth } from "@/lib/AuthContext";
import AppNav from "@/components/AppNav";

export default function AppLayout({ children }) {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  // AuthContext (mounted at the root layout) already redirects to /login
  // when there's no session — this just avoids flashing protected content
  // for the instant before that redirect happens.
  if (!session) return null;

  return (
    // min-h-dvh (dynamic viewport height), not min-h-screen (100vh): on
    // mobile, 100vh is fixed to whatever height the browser's address bar
    // left available when the page first loaded. As you scroll and that
    // bar collapses, the real visible viewport grows but a 100vh container
    // doesn't — so the sticky header (which tracks the real viewport)
    // visibly desyncs from the page's scroll position until layout
    // catches up near the bottom. dvh tracks the actual visible viewport
    // continuously, so the sticky header and the scrollbar stay in sync
    // the whole way down.
    <div className="min-h-dvh bg-slate-50">
      <AppNav />
      {children}
    </div>
  );
}
