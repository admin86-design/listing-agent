import React, { useState, useRef, useEffect } from "react";
import {
  Camera, Sparkles, Copy, Check, X, Car, Loader2, Wand2,
  Facebook, Instagram, FileSpreadsheet, Zap, AlertTriangle,
  Share2, Send, Settings
} from "lucide-react";

// ---------- helpers ----------

const resizeImage = (file, maxDim = 900) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataUrl, base64: dataUrl.split(",")[1] });
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

const stripFences = (t) => t.replace(/```json|```/g, "").trim();

const callClaude = async (content) => {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI request failed");
  return data.text;
};

// ---------- theme ----------

const C = {
  bg: "#15171C",
  panel: "#1E2128",
  panelEdge: "#2B2F38",
  ink: "#F2F3F5",
  dim: "#9AA0AC",
  faint: "#5C6270",
  plate: "#F7C600",
  plateDark: "#C99F00",
  green: "#3DDC84",
  red: "#FF6B6B",
};

const FIELD_STYLE = {
  width: "100%",
  background: "#14161B",
  border: `1px solid ${C.panelEdge}`,
  borderRadius: 10,
  color: C.ink,
  padding: "12px 14px",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const PLATFORMS = [
  { id: "facebook", label: "FB Marketplace", icon: Facebook },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "autotrader", label: "AutoTrader", icon: Car },
  { id: "gumtree", label: "Gumtree", icon: Car },
  { id: "story", label: "Story / WhatsApp", icon: Zap },
  { id: "sheets", label: "Sheets Row", icon: FileSpreadsheet },
];

const TONES = ["Trade professional", "Friendly local", "Quick sale"];

// ---------- component ----------


// VIN check: 17 characters, and I/O/Q are never used in VINs.
function vinState(vin) {
  const v = (vin || "").toUpperCase();
  if (!v) return { ok: false, colour: "#6b7280", message: "Needed for Google vehicle ads - 17 characters from the V5C" };
  const bad = [...new Set(v.split("").filter((c) => "IOQ".includes(c)))];
  if (bad.length) return { ok: false, colour: "#dc2626", message: "VINs never contain " + bad.join(", ") + " - check the V5C" };
  if (!/^[A-HJ-NPR-Z0-9]*$/.test(v)) return { ok: false, colour: "#dc2626", message: "Letters and numbers only" };
  if (v.length < 17) return { ok: false, colour: "#b45309", message: v.length + " of 17 characters" };
  return { ok: true, colour: "#16a34a", message: "Valid VIN" };
}

export default function CarListingAgent() {
  const [photos, setPhotos] = useState([]); // {dataUrl, base64}
  const [reading, setReading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [activeTab, setActiveTab] = useState("facebook");
  const [posts, setPosts] = useState(null);
  const [copiedId, setCopiedId] = useState("");
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const [video, setVideo] = useState(null); // {url, name, duration}
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [postStatus, setPostStatus] = useState(""); // "", "sending", "sent"

  // load saved webhook URL (persists between sessions)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("autopost_webhook_url");
      if (saved) setWebhookUrl(saved);
    } catch {} // private browsing — fine, just won't persist
  }, []);

  const saveWebhook = () => {
    try {
      localStorage.setItem("autopost_webhook_url", webhookUrl.trim());
    } catch {} // private browsing — works for this session anyway
    setShowSettings(false);
  };

  // ----- approve & auto-post via Make/Zapier webhook -----
  const approveAndPost = async () => {
    if (!webhookUrl.trim()) { setShowSettings(true); return; }
    setPostStatus("sending");
    setError("");
    try {
      // 1) upload each photo to ImgBB (one at a time = small, reliable requests)
      const photoUrls = [];
      const toSend = photos.slice(0, 6);
      for (let i = 0; i < toSend.length; i++) {
        const hr = await fetch("/api/host-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: toSend[i].base64 }),
        });
        const hd = await hr.json();
        if (!hr.ok || !hd.url) throw new Error(hd.error || "photo upload failed");
        photoUrls.push(hd.url);
      }

      // 2) send Make only the lightweight links + captions
      const payload = {
        source: "morgan-autos-listing-agent",
        approved_at: new Date().toISOString(),
        car: { ...form },
        posts: {
          facebook: posts.facebook || "",
          instagram: posts.instagram || "",
          story: posts.story || "",
        },
        photo_urls: photoUrls,          // array of hosted image links
        photo_main: photoUrls[0] || "", // first photo, handy for Instagram
      };
      const r = await fetch("/api/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim(), payload }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "delivery failed");
      setPostStatus("sent");
      setTimeout(() => setPostStatus(""), 4000);
    } catch (e) {
      setPostStatus("");
      const msg = e && e.message ? e.message : "";
      setError(
        (msg && msg !== "delivery failed" ? msg + " — " : "") +
        "The advert didn't reach your webhook. Check the URL in Setup and that your Make scenario is ON."
      );
    }
  };

  const [form, setForm] = useState({
    reg: "", vin: "", make: "", model: "", year: "", mileage: "",
    price: "", mot: "", fuel: "", gearbox: "", colour: "",
    engine: "", body: "", doors: "",
    keys: "", owners: "", serviceHistory: "", extras: "",
    highlights: "", honest: "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ----- photos -----
  const onFiles = async (e) => {
    setError("");
    const files = Array.from(e.target.files || []).slice(0, 20 - photos.length);
    try {
      const processed = await Promise.all(files.map((f) => resizeImage(f)));
      setPhotos((p) => [...p, ...processed]);
    } catch {
      setError("One of the photos couldn't be read. Try a different image.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (i) => setPhotos(photos.filter((_, idx) => idx !== i));

  // ----- video (1 max, 35s max) -----
  const onVideo = (e) => {
    setError("");
    const file = (e.target.files || [])[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration > 35.5) {
        URL.revokeObjectURL(url);
        setError(`That video is ${Math.round(v.duration)}s — the limit is 35 seconds. Trim it in your camera roll and re-add it.`);
      } else {
        setVideo({ url, name: file.name, duration: Math.round(v.duration) });
      }
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Couldn't read that video file. Try MP4 or MOV.");
    };
    v.src = url;
    if (videoRef.current) videoRef.current.value = "";
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
  };

  // ----- AI: read the photos -----
  const readPhotos = async () => {
    if (!photos.length) return;
    setReading(true);
    setError("");
    try {
      const content = [
        ...photos.slice(0, 4).map((p) => ({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: p.base64 },
        })),
        {
          type: "text",
          text:
            "You are helping a UK car dealer list this vehicle. From the photos, identify what you can. " +
            "Respond ONLY with raw JSON, no markdown fences, no preamble, with these keys (use empty string if unsure): " +
            '{"make":"","model":"","colour":"","year_guess":"","fuel_guess":"","gearbox_guess":"","notable_features":""} ' +
            "notable_features should be a short comma-separated list of selling points visible in the photos (alloys, screen, leather, condition).",
        },
      ];
      const text = await callClaude(content);
      const d = JSON.parse(stripFences(text));
      setForm((f) => ({
        ...f,
        make: f.make || d.make || "",
        model: f.model || d.model || "",
        colour: f.colour || d.colour || "",
        year: f.year || d.year_guess || "",
        fuel: f.fuel || d.fuel_guess || "",
        gearbox: f.gearbox || d.gearbox_guess || "",
        highlights: f.highlights
          ? f.highlights
          : d.notable_features || "",
      }));
    } catch {
      setError("Couldn't read the photos automatically — fill the details in manually and it'll still work.");
    }
    setReading(false);
  };

  // ----- AI: generate posts (one call per platform = reliable) -----
  const PLATFORM_TASKS = {
    facebook:
      "Write a Facebook Marketplace description. Punchy opener, clear spec list with line breaks, the price, a viewing/delivery line, and a call to action. 120-200 words.",
    instagram:
      "Write an Instagram caption: short, energetic, emoji-light. End with 10-15 relevant UK car sales hashtags on a new line.",
    autotrader:
      "Write a professional AutoTrader-style description: formal, spec-focused, paragraph form, no emojis. 100-160 words.",
    gumtree:
      "Write a Gumtree ad: straightforward and local, include the price and a contact prompt. 80-140 words.",
    story:
      "Write a very short punchy text for an Instagram/WhatsApp story or status. Max 30 words. Car, price, one hook, end with 'DM to view'.",
  };

  const generate = async () => {
    if (!form.make && !form.model) {
      setError("Add at least the make and model before generating.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const details = Object.entries({
        Registration: form.reg, Make: form.make, Model: form.model,
        Year: form.year, Mileage: form.mileage, "Price (GBP)": form.price,
        "MOT until": form.mot, Fuel: form.fuel, Gearbox: form.gearbox,
        "Engine size": form.engine, "Body style": form.body, Doors: form.doors,
        Colour: form.colour,
        "Number of keys": form.keys,
        "Previous owners": form.owners,
        "Service history": form.serviceHistory,
        "Added extras / optional spec": form.extras,
        "Selling points": form.highlights,
        "Honest notes / known issues": form.honest,
      })
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");

      const base =
        `You are the marketing agent for a UK used car dealer (Morgan Autos, Ascot area). ` +
        `TONE: ${tone}. UK English, UK market conventions (miles, GBP, MOT, ULEZ if relevant). ` +
        `Be truthful — never invent spec or history that isn't listed. If honest notes mention issues, disclose them plainly. ` +
        `Weave in the keys, owner count, service history and any added extras naturally where they help the sale — buyers care about these. ` +
        `Write a complete, ready-to-publish advert that needs no further editing.\n\n` +
        `CAR DETAILS:\n${details}`;

      const imgs = photos.slice(0, 2).map((p) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: p.base64 },
      }));

      const tasks = Object.entries(PLATFORM_TASKS).map(async ([id, task]) => {
        const text = await callClaude([
          ...imgs,
          {
            type: "text",
            text: `${base}\n\nTASK: ${task}\n\nRespond with ONLY the post text itself — no preamble, no labels, no quotation marks around it, no markdown fences.`,
          },
        ]);
        const clean = stripFences(text).trim();
        if (!clean) throw new Error("empty");
        return [id, clean];
      });

      const results = await Promise.allSettled(tasks);
      const next = {};
      const failed = [];
      results.forEach((r, i) => {
        const id = Object.keys(PLATFORM_TASKS)[i];
        if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
        else failed.push(PLATFORMS.find((p) => p.id === id)?.label || id);
      });

      if (Object.keys(next).length === 0) {
        setError("Couldn't reach the AI just now — check your connection and tap Generate again.");
      } else {
        setPosts(next);
        setActiveTab(next.facebook ? "facebook" : Object.keys(next)[0]);
        if (failed.length) {
          setError(`${failed.join(", ")} didn't come through — tap Generate again to retry.`);
        }
      }
    } catch {
      setError("Couldn't reach the AI just now — check your connection and tap Generate again.");
    }
    setGenerating(false);
  };

  // ----- sheets row (built locally, drives your Zapier auto-post) -----
  const sheetsRow = posts
    ? [form.reg, form.make, form.model, form.year, form.mileage,
       form.price, form.mot, form.fuel, form.gearbox, form.colour,
       (posts.facebook || "").replace(/\t/g, " ").replace(/\n/g, " | "),
      ].join("\t")
    : "";

  const copy = async (text, id) => {
    setError("");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setError("Copy was blocked — use the Share button instead, or long-press the text to select it.");
    }
  };

  // native share sheet — text goes straight into FB / Instagram / WhatsApp
  const shareText = async (text) => {
    setError("");
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        copy(text, activeTab);
      }
    } catch {} // user closed the share sheet — not an error
  };

  const tabContent = () => {
    if (!posts) return null;
    if (activeTab === "sheets") return sheetsRow;
    return posts[activeTab] || "This one didn't generate — tap Generate again to retry.";
  };

  const sectionTitle = (n, t) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "26px 0 12px" }}>
      <span style={{
        fontFamily: "'Saira Condensed', sans-serif", fontWeight: 700,
        color: C.plate, fontSize: 15, letterSpacing: 2,
      }}>{n}</span>
      <span style={{
        fontFamily: "'Saira Condensed', sans-serif", fontWeight: 600,
        fontSize: 19, letterSpacing: 1.5, textTransform: "uppercase", color: C.ink,
      }}>{t}</span>
      <div style={{ flex: 1, height: 1, background: C.panelEdge }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
        input::placeholder, textarea::placeholder { color: ${C.faint}; }
        input:focus, textarea:focus { border-color: ${C.plate} !important; }
        button { cursor: pointer; }
        button:focus-visible { outline: 2px solid ${C.plate}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{
            background: C.plate, borderRadius: 6, padding: "4px 10px",
            display: "flex", alignItems: "center", gap: 6,
            border: `2px solid ${C.plateDark}`,
          }}>
            <div style={{ background: "#003399", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 3px", borderRadius: 2, lineHeight: 1 }}>UK</div>
            <span style={{ fontFamily: "'Saira Condensed', sans-serif", fontWeight: 800, color: "#111", fontSize: 18, letterSpacing: 1 }}>MORGAN AUTOS</span>
          </div>
        </div>
        <h1 style={{ fontFamily: "'Saira Condensed', sans-serif", fontWeight: 800, fontSize: 38, letterSpacing: 1, margin: "10px 0 2px", textTransform: "uppercase" }}>
          Listing <span style={{ color: C.plate }}>Agent</span>
        </h1>
        <p style={{ color: C.dim, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Drop in the photos, confirm the details, and get ready-to-post ads for every platform.
        </p>

        {/* 01 photos */}
        {sectionTitle("01", "Photos")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${C.panelEdge}` }}>
              <img src={p.dataUrl} alt={`Car photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => removePhoto(i)} aria-label="Remove photo" style={{
                position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)",
                border: "none", borderRadius: "50%", width: 24, height: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <X size={14} color="#fff" />
              </button>
            </div>
          ))}
          {photos.length < 20 && (
            <button onClick={() => fileRef.current?.click()} style={{
              aspectRatio: "1", borderRadius: 10, border: `1.5px dashed ${C.faint}`,
              background: "transparent", color: C.dim, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12,
            }}>
              <Camera size={20} />
              Add photo
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
        <p style={{ color: C.faint, fontSize: 12, margin: "8px 0 0" }}>{photos.length}/20 photos</p>

        {/* video */}
        <div style={{ marginTop: 14 }}>
          {video ? (
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.panelEdge}` }}>
              <video src={video.url} controls playsInline style={{ width: "100%", display: "block", maxHeight: 280, background: "#000" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.panel }}>
                <span style={{ fontSize: 13, color: C.dim }}>Walkaround video · {video.duration}s</span>
                <button onClick={removeVideo} aria-label="Remove video" style={{
                  background: "transparent", border: "none", color: C.red,
                  fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
                }}>
                  <X size={14} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => videoRef.current?.click()} style={{
              width: "100%", padding: "13px", borderRadius: 10,
              border: `1.5px dashed ${C.faint}`, background: "transparent",
              color: C.dim, fontSize: 14, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <Zap size={16} color={C.plate} />
              Add walkaround video (max 35s)
            </button>
          )}
        </div>
        <input ref={videoRef} type="file" accept="video/*" onChange={onVideo} style={{ display: "none" }} />

        {photos.length > 0 && (
          <button onClick={readPhotos} disabled={reading} style={{
            marginTop: 12, width: "100%", padding: "13px",
            background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 10,
            color: C.ink, fontSize: 15, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: reading ? 0.7 : 1,
          }}>
            {reading ? <Loader2 size={17} className="spin" /> : <Wand2 size={17} color={C.plate} />}
            {reading ? "Reading the photos..." : "Auto-fill details from photos"}
          </button>
        )}

        {/* 02 details */}
        {sectionTitle("02", "The Car")}

        {/* reg plate input */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{
            display: "flex", alignItems: "stretch", borderRadius: 8, overflow: "hidden",
            border: `2px solid ${C.plateDark}`, width: "100%", maxWidth: 280,
          }}>
            <div style={{ background: "#003399", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 8px", fontSize: 11, fontWeight: 700 }}>
              UK
            </div>
            <input
              value={form.reg}
              onChange={(e) => setForm({ ...form, reg: e.target.value.toUpperCase() })}
              placeholder="REG PLATE"
              aria-label="Registration plate"
              style={{
                flex: 1, background: C.plate, border: "none", outline: "none",
                fontFamily: "'Saira Condensed', sans-serif", fontWeight: 800,
                fontSize: 26, letterSpacing: 3, textAlign: "center", color: "#111",
                padding: "10px 6px", minWidth: 0,
              }}
            />
          </div>
        </div>

        {/* VIN - required by Google vehicle ads */}
        <div style={{ marginBottom: 10 }}>
          <input
            style={{
              ...FIELD_STYLE,
              width: "100%",
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              letterSpacing: 1,
              borderColor: vinState(form.vin).colour,
            }}
            placeholder="VIN (17 characters, from the V5C)"
            maxLength={17}
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase().trim() })}
          />
          <div style={{ fontSize: 12, marginTop: 4, color: vinState(form.vin).colour }}>
            {vinState(form.vin).message}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input style={FIELD_STYLE} placeholder="Make" value={form.make} onChange={set("make")} />
          <input style={FIELD_STYLE} placeholder="Model" value={form.model} onChange={set("model")} />
          <input style={FIELD_STYLE} placeholder="Year" inputMode="numeric" value={form.year} onChange={set("year")} />
          <input style={FIELD_STYLE} placeholder="Mileage" inputMode="numeric" value={form.mileage} onChange={set("mileage")} />
          <input style={FIELD_STYLE} placeholder="Price £" inputMode="numeric" value={form.price} onChange={set("price")} />
          <input style={FIELD_STYLE} placeholder="MOT until" value={form.mot} onChange={set("mot")} />
          <input style={FIELD_STYLE} placeholder="Fuel" value={form.fuel} onChange={set("fuel")} />
          <input style={FIELD_STYLE} placeholder="Gearbox" value={form.gearbox} onChange={set("gearbox")} />
          <input style={FIELD_STYLE} placeholder="Engine (e.g. 2.0L)" value={form.engine} onChange={set("engine")} />
          <input style={FIELD_STYLE} placeholder="Body (e.g. Saloon)" value={form.body} onChange={set("body")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <input style={FIELD_STYLE} placeholder="Colour" value={form.colour} onChange={set("colour")} />
          <input style={FIELD_STYLE} placeholder="Doors" inputMode="numeric" value={form.doors} onChange={set("doors")} />
        </div>

        {/* key selling info — the bits buyers ask about */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "22px 0 12px" }}>
          <span style={{
            fontFamily: "'Saira Condensed', sans-serif", fontWeight: 700,
            color: C.plate, fontSize: 15, letterSpacing: 2,
          }}>03</span>
          <span style={{
            fontFamily: "'Saira Condensed', sans-serif", fontWeight: 600,
            fontSize: 19, letterSpacing: 1.5, textTransform: "uppercase", color: C.ink,
          }}>Key Selling Info</span>
          <div style={{ flex: 1, height: 1, background: C.panelEdge }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: C.dim, display: "block", marginBottom: 4 }}>Keys</label>
            <select style={{ ...FIELD_STYLE, appearance: "auto" }} value={form.keys} onChange={set("keys")}>
              <option value="">—</option>
              <option value="1 key">1 key</option>
              <option value="2 keys">2 keys</option>
              <option value="3 keys">3 keys</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.dim, display: "block", marginBottom: 4 }}>Previous owners</label>
            <select style={{ ...FIELD_STYLE, appearance: "auto" }} value={form.owners} onChange={set("owners")}>
              <option value="">—</option>
              <option value="1 owner from new">1 (from new)</option>
              <option value="2 owners">2</option>
              <option value="3 owners">3</option>
              <option value="4 owners">4</option>
              <option value="5+ owners">5+</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: C.dim, display: "block", marginBottom: 4 }}>Service history</label>
          <select style={{ ...FIELD_STYLE, appearance: "auto" }} value={form.serviceHistory} onChange={set("serviceHistory")}>
            <option value="">—</option>
            <option value="Full service history">Full service history</option>
            <option value="Full main dealer service history">Full main dealer history</option>
            <option value="Part service history">Part service history</option>
            <option value="Service book present, stamps inside">Service book present</option>
            <option value="No service history">No service history</option>
          </select>
        </div>

        <textarea
          style={{ ...FIELD_STYLE, marginTop: 10, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          placeholder="Added extras / optional spec — sat nav, heated leather seats, parking sensors, upgraded alloys, panoramic roof, tow bar..."
          value={form.extras} onChange={set("extras")}
        />
        <textarea
          style={{ ...FIELD_STYLE, marginTop: 10, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
          placeholder="Anything else to push — new tyres, recent cambelt, ULEZ compliant, long MOT, delivery available..."
          value={form.highlights} onChange={set("highlights")}
        />
        <textarea
          style={{ ...FIELD_STYLE, marginTop: 10, minHeight: 54, resize: "vertical", fontFamily: "inherit" }}
          placeholder="Honest notes (optional) — small dent rear arch, cat N, etc."
          value={form.honest} onChange={set("honest")}
        />

        {/* tone */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {TONES.map((t) => (
            <button key={t} onClick={() => setTone(t)} style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: `1px solid ${tone === t ? C.plate : C.panelEdge}`,
              background: tone === t ? "rgba(247,198,0,0.12)" : "transparent",
              color: tone === t ? C.plate : C.dim,
            }}>{t}</button>
          ))}
        </div>

        {/* generate */}
        <button onClick={generate} disabled={generating} style={{
          marginTop: 20, width: "100%", padding: "16px",
          background: C.plate, border: "none", borderRadius: 12,
          color: "#111", fontSize: 17, fontWeight: 800,
          fontFamily: "'Saira Condensed', sans-serif", letterSpacing: 2, textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: generating ? 0.75 : 1,
        }}>
          {generating ? <Loader2 size={20} className="spin" /> : <Sparkles size={20} />}
          {generating ? "Writing your ads..." : "Generate all listings"}
        </button>

        {error && (
          <div style={{
            marginTop: 12, padding: "11px 14px", borderRadius: 10, fontSize: 14,
            background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.35)",
            color: C.red, display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            {error}
          </div>
        )}

        {/* 03 results */}
        {posts && (
          <>
            {sectionTitle("03", "Ready to Post")}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                const active = activeTab === p.id;
                return (
                  <button key={p.id} onClick={() => setActiveTab(p.id)} style={{
                    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                    padding: "9px 13px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${active ? C.plate : C.panelEdge}`,
                    background: active ? "rgba(247,198,0,0.12)" : C.panel,
                    color: active ? C.plate : C.dim,
                  }}>
                    <Icon size={14} /> {p.label}
                  </button>
                );
              })}
            </div>

            <div style={{
              marginTop: 10, background: C.panel, border: `1px solid ${C.panelEdge}`,
              borderRadius: 12, padding: 16,
            }}>
              {activeTab === "sheets" && (
                <p style={{ color: C.dim, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
                  Tab-separated row — paste straight into your inventory Google Sheet to trigger the Zapier → Facebook auto-post.
                  Columns: Reg, Make, Model, Year, Mileage, Price, MOT, Fuel, Gearbox, Colour, FB text.
                </p>
              )}
              <pre style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit",
                fontSize: 14.5, lineHeight: 1.6, color: C.ink, margin: 0,
              }}>{tabContent()}</pre>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => copy(tabContent(), activeTab)} style={{
                  flex: 1, padding: "13px",
                  background: copiedId === activeTab ? "rgba(61,220,132,0.15)" : "#14161B",
                  border: `1px solid ${copiedId === activeTab ? C.green : C.panelEdge}`,
                  borderRadius: 10, color: copiedId === activeTab ? C.green : C.ink,
                  fontSize: 15, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  {copiedId === activeTab ? <Check size={17} /> : <Copy size={17} />}
                  {copiedId === activeTab ? "Copied" : "Copy"}
                </button>
                <button onClick={() => shareText(tabContent())} style={{
                  flex: 1, padding: "13px", background: "#14161B",
                  border: `1px solid ${C.panelEdge}`, borderRadius: 10, color: C.ink,
                  fontSize: 15, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <Share2 size={17} />
                  Share to app
                </button>
              </div>
            </div>
          </>
        )}

        {/* approve & auto-post — always visible */}
        <div style={{
          marginTop: 14, background: C.panel, border: `1px solid ${C.panelEdge}`,
          borderRadius: 12, padding: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontFamily: "'Saira Condensed', sans-serif", fontWeight: 700,
              fontSize: 16, letterSpacing: 1.5, textTransform: "uppercase",
            }}>Auto-post</span>
            <button onClick={() => setShowSettings(!showSettings)} aria-label="Auto-post settings" style={{
              background: "transparent", border: "none", color: webhookUrl ? C.dim : C.plate,
              display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600,
            }}>
              <Settings size={15} /> {webhookUrl ? "Setup" : "Setup — start here"}
            </button>
          </div>

          {showSettings && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: C.dim, fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}>
                Paste your Make.com or Zapier webhook URL. Approving an advert sends the photos,
                details and captions there — your scenario then posts to your Facebook Page and Instagram.
              </p>
              <input
                style={FIELD_STYLE}
                placeholder="https://hook.eu1.make.com/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <button onClick={saveWebhook} style={{
                marginTop: 8, width: "100%", padding: "11px",
                background: "#14161B", border: `1px solid ${C.panelEdge}`,
                borderRadius: 10, color: C.ink, fontSize: 14, fontWeight: 600,
              }}>Save webhook</button>
            </div>
          )}

          <button onClick={approveAndPost} disabled={postStatus === "sending" || !posts} style={{
            marginTop: 12, width: "100%", padding: "14px",
            background: !posts ? C.panelEdge : postStatus === "sent" ? "rgba(61,220,132,0.15)" : C.plate,
            border: postStatus === "sent" ? `1px solid ${C.green}` : "none",
            borderRadius: 10,
            color: !posts ? C.faint : postStatus === "sent" ? C.green : "#111",
            fontSize: 15, fontWeight: 800,
            fontFamily: "'Saira Condensed', sans-serif", letterSpacing: 1.5, textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: postStatus === "sending" ? 0.75 : 1,
            cursor: !posts ? "not-allowed" : "pointer",
          }}>
            {postStatus === "sending" ? <Loader2 size={18} className="spin" />
              : postStatus === "sent" ? <Check size={18} /> : <Send size={18} />}
            {!posts ? "Generate a listing first, then approve"
              : postStatus === "sending" ? "Sending advert..."
              : postStatus === "sent" ? "Sent — posting via your Zap"
              : "Approve & auto-post to FB + Insta"}
          </button>
          <p style={{ color: C.faint, fontSize: 12, margin: "8px 0 0", lineHeight: 1.5 }}>
            Sends the first 6 photos with the Facebook and Instagram captions. Video isn't sent — attach it manually if you want it in the post.
          </p>
        </div>
      </div>
    </div>
  );
}
