// Vercel serverless function: draws the couple portrait with Google's Gemini image model.
//
// Setup (once): add a GEMINI_API_KEY environment variable to the Vercel project (a key from
// https://aistudio.google.com/apikey) and redeploy. Optionally set GEMINI_IMAGE_MODEL to use a different image model.
// Until the key exists this answers 503 and the app simply keeps showing the collage of the two photos.
//
// Only signed-in TW users can call it: the browser sends its Firebase ID token, which is checked here before anything
// is sent to the AI. The photos are forwarded once and never stored by this function.

// The public web API key the site already ships with (it identifies the Firebase project; it is not a secret).
const FIREBASE_API_KEY = "AIzaSyBeBde2ro0vYt3XADcdmbuu56HdylpajQA";
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const COOLDOWN_MS = 60 * 1000;     // one portrait per person per minute
const MAX_IMAGE_CHARS = 700000;    // each photo as a data URL
const PROVIDER_TIMEOUT_MS = 55 * 1000;
const IMAGE_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const PROMPT = [
  "Create a charming, wholesome illustrated couple portrait from the two people in the attached photos.",
  "Draw them side by side, close together and smiling, in a soft pastel kawaii illustration style with a gentle pink and lilac gradient background,",
  "a few floating hearts and sparkles, and a warm, romantic mood.",
  "Keep each person recognisable: their hair, skin tone, glasses and distinctive features.",
  "Square composition, head-and-shoulders, no text, no logos."
].join(" ");

const lastCall = new Map();

async function verifyUser(idToken) {
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.users && data.users[0] ? data.users[0].localId : null;
}

function readImages(body) {
  const list = body && Array.isArray(body.images) ? body.images : null;
  if (!list || list.length !== 2) return null;
  const parsed = [];
  for (const item of list) {
    if (typeof item !== "string" || item.length > MAX_IMAGE_CHARS) return null;
    const match = IMAGE_URL.exec(item);
    if (!match) return null;
    parsed.push({ mime: match[1], data: match[2] });
  }
  return parsed;
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return response.status(405).json({ error: "method" }); }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(503).json({ error: "not_configured" });

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const uid = token ? await verifyUser(token).catch(() => null) : null;
  if (!uid) return response.status(401).json({ error: "auth" });

  const images = readImages(request.body);
  if (!images) return response.status(400).json({ error: "images" });

  const now = Date.now();
  if (now - (lastCall.get(uid) || 0) < COOLDOWN_MS) return response.status(429).json({ error: "slow_down" });
  lastCall.set(uid, now);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const result = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, ...images.map(image => ({ inline_data: { mime_type: image.mime, data: image.data } }))] }]
      }),
      signal: controller.signal
    });
    if (result.status === 429) return response.status(429).json({ error: "provider_busy" });
    if (!result.ok) return response.status(502).json({ error: "provider" });
    const data = await result.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const picture = parts.map(part => part.inlineData || part.inline_data).find(Boolean);
    if (!picture || !picture.data) return response.status(422).json({ error: "no_image" });
    return response.status(200).json({ image: "data:" + (picture.mimeType || picture.mime_type || "image/png") + ";base64," + picture.data });
  } catch (error) {
    return response.status(error && error.name === "AbortError" ? 504 : 502).json({ error: "provider" });
  } finally {
    clearTimeout(timer);
  }
};
