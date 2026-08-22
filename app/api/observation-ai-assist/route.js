// Server-side only — ANTHROPIC_API_KEY never reaches the browser.
// One call covers both Compliance Co-Pilot and AI-drafted corrective
// actions, since they're really the same request: reasoning over a
// finding's text and suggesting what's relevant. All of this is
// SUGGESTED, never automatic — a manager reviews and decides, always.

export async function POST(request) {
  const { question, categoryTag, notes } = await request.json();

  if (!question) {
    return Response.json({ error: "Missing question." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — skipping AI assist.");
    return Response.json({ skipped: true, notConfigured: true });
  }

  const prompt = `You are assisting a health & safety manager reviewing a failed inspection finding.

Finding (checklist item that failed): "${question}"
Category: ${categoryTag || "not specified"}
Inspector's notes: ${notes || "none given"}

Respond with ONLY valid JSON, no other text, in exactly this shape:
{
  "complianceNote": "one short sentence noting a general area of H&S regulation or an ISO 45001 clause this MAY relate to — be conservative, use words like 'may relate to' or 'worth checking against', and leave this as an empty string if you are not reasonably confident, rather than guessing a specific clause number you're unsure of",
  "riskLevel": "low", "medium", or "high",
  "suggestedDueDays": a number of days a corrective action like this would reasonably need to be closed out by,
  "suggestedAction": "one short, concrete, practical corrective action a site team could actually take"
}

Getting a compliance citation wrong is worse than saying nothing — only include a specific clause or regulation if you're genuinely confident, otherwise describe it in general terms or leave it blank.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 512,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", errText);
      return Response.json({ error: "AI assist failed." }, { status: 502 });
    }

    const data = await res.json();

    if (data.stop_reason === "refusal") {
      // Safety classifiers declined — treat like "nothing to suggest"
      // rather than surfacing an error to the manager.
      return Response.json({ skipped: true });
    }

    const textBlock = data.content?.find((b) => b.type === "text");
    if (!textBlock) {
      return Response.json({ skipped: true });
    }

    let suggestion;
    try {
      suggestion = JSON.parse(textBlock.text);
    } catch {
      console.error("AI assist returned non-JSON:", textBlock.text);
      return Response.json({ skipped: true });
    }

    return Response.json(suggestion);
  } catch (err) {
    console.error("AI assist exception:", err);
    return Response.json({ error: "AI assist failed." }, { status: 500 });
  }
}
