"use client";

import { useState, useEffect } from "react";

// Tracks the browser's actual connectivity. Note: navigator.onLine is
// technically only a guarantee about the local network connection, not
// that Supabase itself is reachable (e.g. wifi connected but the internet
// is down) — good enough for this purpose, since a real request failure
// during sync is handled separately and will just retry next time.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
