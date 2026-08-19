// Uploads one photo (base64) to ImgBB and returns the hosted URL.
// Set IMGBB_API_KEY in Vercel: Project Settings -> Environment Variables.

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!process.env.IMGBB_API_KEY) {
    return res.status(500).json({ error: "IMGBB_API_KEY is not set in Vercel." });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing image" });
  }

  try {
    // strip any data URL prefix — ImgBB wants raw base64
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const form = new URLSearchParams();
    form.append("image", clean);

    const r = await fetch(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }
    );
    const data = await r.json();
    if (!r.ok || !data.success) {
      return res.status(502).json({ error: "ImgBB upload failed" });
    }
    return res.status(200).json({ url: data.data.url });
  } catch (e) {
    return res.status(500).json({ error: "Could not reach ImgBB" });
  }
}
