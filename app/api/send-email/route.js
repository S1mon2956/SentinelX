// Server-side only — this file never runs in the browser, so it's safe to
// use RESEND_API_KEY here even though it has no NEXT_PUBLIC_ prefix.
// This is the ONLY place that secret should ever be referenced.

export async function POST(request) {
  const { to, subject, body, link } = await request.json();

  if (!to || !subject) {
    return Response.json({ error: "Missing 'to' or 'subject'." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    // Fail quietly from the caller's point of view — a missing email
    // provider should never break the in-app notification that already
    // succeeded. Logged here so it's visible in the server console.
    console.error("RESEND_API_KEY is not set — skipping email send.");
    return Response.json({ skipped: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fullLink = link ? `${appUrl}${link}` : appUrl;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SentinelX <onboarding@resend.dev>",
        to,
        subject,
        html: `<p>${body || ""}</p><p><a href="${fullLink}">Open in SentinelX</a></p>`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error:", errText);
      return Response.json({ error: "Email send failed." }, { status: 502 });
    }

    return Response.json({ sent: true });
  } catch (err) {
    console.error("Email send exception:", err);
    return Response.json({ error: "Email send failed." }, { status: 500 });
  }
}
