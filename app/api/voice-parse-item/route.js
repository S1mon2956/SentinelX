// Server-side only — ANTHROPIC_API_KEY never reaches the browser.
// Takes a voice-to-text transcript plus the list of checklist item
// questions on this inspection, and figures out which item the inspector
// was talking about and what they said the result should be. Always
// returned as a SUGGESTION for the inspector to confirm on screen before
// it's applied — never silently sets an answer on its own.

export async function POST(request) {
  const { transcript, itemQuestions } = await request.json();

  if (!transcript || !Array.isArray(itemQuestions) || itemQuestions.length === 0) {
    return Response.json({ error: "Missing transcript or item list." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — skipping voice parse.");
    return Response.json({ skipped: true });
  }

  const prompt = `An inspector on a safety audit spoke this out loud, transcribed by voice-to-text (it may contain small transcription errors): "${transcript}"

Here are the checklist items on this inspection:
${itemQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Work out which single item they're referring to, and what result they gave.

Respond with ONLY valid JSON, no other text, in exactly this shape:
{
  "matchedItem": "the exact text of the matching item copied verbatim from the numbered list above, or an empty string if you cannot confidently match one",
  "value": "pass", "fail", "na", or empty string if unclear,
  "notes": "any extra detail they mentioned about the issue, as a short note — empty string if none"
}

Only match an item if you're genuinely confident — leave matchedItem empty rather than guessing.`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", errText);
      return Response.json({ error: "Voice parse failed." }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.find((c) => c.type === "text")?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "Could not parse response." }, { status: 502 });
    }

    return Response.json({
      matchedItem: parsed.matchedItem || "",
      value: ["pass", "fail", "na"].includes(parsed.value) ? parsed.value : "",
      notes: parsed.notes || "",
    });
  } catch (err) {
    console.error("Voice parse exception:", err);
    return Response.json({ error: "Voice parse failed." }, { status: 500 });
  }
}
