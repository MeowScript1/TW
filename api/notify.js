// Vercel serverless function: sends a push notification to your partner's phone (or, with test:true, to your own).
//
// Setup (once): in the Vercel project add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT, e.g.
// mailto:you@example.com) and redeploy. Until then this answers 503 and TW falls back to in-app alerts.
//
// Only signed-in TW users can call it: the browser sends its Firebase ID token, which is checked here. The function then
// reads the couple and the devices that have notifications turned on using *that user's* token, so the Firestore
// security rules decide what it may see — it never has database admin access.
const webpush = require("web-push");

// The public web API key the site already ships with (it identifies the Firebase project; it is not a secret).
const FIREBASE_API_KEY = "AIzaSyBeBde2ro0vYt3XADcdmbuu56HdylpajQA";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/aytt-677b4/databases/(default)/documents";
const COUPLE_ID = /^[A-Z0-9]{4,16}$/;
// Only real browser push services; the endpoints come from the database, so never call anything else.
const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const MAX_PER_MINUTE = 40;
const calls = new Map();

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

async function readFirestore(path, idToken) {
  const response = await fetch(FIRESTORE + path, { headers: { Authorization: "Bearer " + idToken } });
  return response.ok ? response.json() : null;
}

const text = (field, max) => (typeof field === "string" ? field.trim().slice(0, max) : "");
const stringField = field => (field && typeof field.stringValue === "string" ? field.stringValue : "");

function tooMany(uid) {
  const now = Date.now(), recent = (calls.get(uid) || []).filter(at => now - at < 60000);
  recent.push(now); calls.set(uid, recent);
  return recent.length > MAX_PER_MINUTE;
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return response.status(405).json({ error: "method" }); }

  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return response.status(503).json({ error: "not_configured" });

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const uid = token ? await verifyUser(token).catch(() => null) : null;
  if (!uid) return response.status(401).json({ error: "auth" });
  if (tooMany(uid)) return response.status(429).json({ error: "slow_down" });

  const body = request.body || {};
  const coupleId = typeof body.coupleId === "string" ? body.coupleId : "";
  const title = text(body.title, 80), message = text(body.body, 200), tag = text(body.tag, 40) || "tw";
  if (!COUPLE_ID.test(coupleId) || !title) return response.status(400).json({ error: "request" });

  const couple = await readFirestore("/couples/" + coupleId, token);
  const members = couple && couple.fields && couple.fields.members && couple.fields.members.arrayValue
    ? (couple.fields.members.arrayValue.values || []).map(stringField) : [];
  if (!members.includes(uid)) return response.status(403).json({ error: "not_a_member" });

  const targets = body.test === true ? [uid] : members.filter(member => member !== uid);
  const listing = await readFirestore("/couples/" + coupleId + "/push?pageSize=100", token);
  const devices = ((listing && listing.documents) || []).map(document => document.fields || {})
    .filter(fields => targets.includes(stringField(fields.uid)))
    .map(fields => ({ endpoint: stringField(fields.endpoint), keys: { p256dh: stringField(fields.p256dh), auth: stringField(fields.auth) } }))
    .filter(device => PUSH_ENDPOINT.test(device.endpoint) && device.keys.p256dh && device.keys.auth);
  if (!devices.length) return response.status(200).json({ sent: 0, devices: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://our-tw.vercel.app", publicKey, privateKey);
  const payload = JSON.stringify({ title, body: message, tag, url: "./" });
  const results = await Promise.allSettled(devices.map(device => webpush.sendNotification(device, payload, { TTL: 3600, urgency: "high" })));
  return response.status(200).json({ sent: results.filter(result => result.status === "fulfilled").length, devices: devices.length });
};
