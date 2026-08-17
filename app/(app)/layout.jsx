"use client";

import { useAuth } from "@/lib/AuthContext";
import AppNav from "@/components/AppNav";

export default function AppLayout({ children }) {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  // AuthContext (mounted at the root layout) already redirects to /login
  // when there's no session — this just avoids flashing protected content
  // for the instant before that redirect happens.
  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      {children}
    </div>
  );
}
