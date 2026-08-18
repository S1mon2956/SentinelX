// Server-side only — ANTHROPIC_API_KEY never reaches the browser.
// Takes a photo + the checklist question + the answer the inspector gave,
// and asks Claude whether the photo looks consistent with a "pass" answer.
// This is a SUGGESTION, not an automatic override — the inspector always
// makes the final call. Silently auto-changing a compliance record based
// on an AI guess would be the wrong design for something audit-related.

export async function POST(request) {
  const { imageBase64, mediaType, question } = await request.json();

  if (!imageBase64 || !question) {
    return Response.json({ error: "Missing image or question." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — skipping photo check.");
    return Response.json({ skipped: true });
  }

  const prompt = `You are assisting a safety inspector. They marked the checklist item "${question}" as PASS and attached this photo as evidence.

Look carefully at the photo. Does anything in it appear to actually contradict a "pass" result for this specific item (e.g. an obstruction, damage, missing equipment, an unsafe condition)?

Respond with ONLY valid JSON, no other text, in exactly this shape:
{"flagged": true or false, "reason": "one short sentence explaining why, or empty string if not flagged"}

Be conservative — only flag if something in the photo is a clear, specific contradiction. If the photo is unclear, unrelated, or you're not confident, do not flag it.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", errText);
      return Response.json({ error: "Photo check failed." }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.find((c) => c.type === "text")?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ flagged: false, reason: "" });
    }

    return Response.json({ flagged: !!parsed.flagged, reason: parsed.reason || "" });
  } catch (err) {
    console.error("Photo check exception:", err);
    return Response.json({ error: "Photo check failed." }, { status: 500 });
  }
}
