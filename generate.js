// Vercel serverless function — keeps your Anthropic API key on the server.
// Set ANTHROPIC_API_KEY in Vercel: Project Settings -> Environment Variables.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set in Vercel environment variables.",
    });
  }

  const { content } = req.body || {};
  if (!Array.isArray(content) || content.length === 0) {
    return res.status(400).json({ error: "Missing content" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: data?.error?.message || "Anthropic API error" });
    }

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Could not reach the Anthropic API" });
  }
}
