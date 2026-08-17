import { supabase } from "@/lib/supabaseClient";

// Creates an in-app notification for `userId`, respecting their per-category
// preference (defaults to on if they've never touched settings). If they
// also have the master "email me" toggle on, this additionally sends a real
// email via /api/send-email. Email failures never block or undo the in-app
// notification — that part has already succeeded by the time email is tried.
export async function notify({ userId, type, title, body, link }) {
  if (!userId) return;

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select(`${type}, email_enabled`)
    .eq("user_id", userId)
    .maybeSingle();

  const categoryEnabled = prefs ? prefs[type] !== false : true;
  if (!categoryEnabled) return;

  await supabase.from("notifications").insert({ user_id: userId, type, title, body, link });

  const emailEnabled = prefs ? prefs.email_enabled !== false : true;
  if (!emailEnabled) return;

  const { data: user } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
  if (!user?.email) return;

  fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: user.email, subject: title, body, link }),
  }).catch((err) => console.error("Email notification failed:", err));
}
