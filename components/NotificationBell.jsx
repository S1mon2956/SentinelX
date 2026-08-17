"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function NotificationBell() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    load();

    // Live updates — a new notification appears without needing a refresh.
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload) => setItems((prev) => [payload.new, ...prev])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile?.id]);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems(data || []);
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative text-slate-500 hover:text-slate-800">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-96 overflow-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-600">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-amber-700 hover:underline">
                  Mark all read
                </button>
              )}
              <Link href="/settings/notifications" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Settings size={14} />
              </Link>
            </div>
          </div>

          {items.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">Nothing yet.</p>}

          {items.map((n) => (
            <Link
              key={n.id}
              href={n.link || "#"}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                !n.read_at ? "bg-amber-50/50" : ""
              }`}
            >
              <p className="text-xs font-medium text-slate-800">{n.title}</p>
              {n.body && <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
