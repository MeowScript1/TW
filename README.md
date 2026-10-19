# TW

A private little web app for two people: pairing by code, live chat with reactions, pokes and love notes,
couple trivia, daily tasks, one-time photo "snaps", and an installable PWA. No build step — it is a
static site backed by Firebase (Auth and Firestore; no Storage bucket or paid plan needed).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app (markup, styles and the module script). `our-little-world.html` just redirects here for old links. |
| `service-worker.js`, `manifest.webmanifest`, `icon*.svg/png` | PWA: offline shell, install metadata, icons. |
| `firestore.rules`, `firebase.json`, `.firebaserc` | Firestore security rules and CLI config (project `aytt-677b4`). |
| `api/couple-portrait.js` | Optional Vercel function that draws the AI couple portrait (see below). |
| `vercel.json` | Security headers and the function's timeout for the Vercel deployment. |
| `tw-local-app/Start TW.command` | Double-click on a Mac to serve this folder on `http://localhost:8765`. |

## Run it locally

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://localhost:8765>. Sign-in and sync talk to the real Firebase project, so use real accounts there.

## Deploy

The site deploys from the repo root on Vercel. **The security rules are not part of that deploy** — publish them
whenever `firestore.rules` changes, either with the Firebase CLI:

```bash
firebase deploy --only firestore:rules --project aytt-677b4
```

or by pasting the file into Firebase console → Firestore Database → Rules and clicking Publish.

## Couple portrait (photos + optional AI)

Each of you can add a photo from the home screen. With both photos in, the home screen shows a collage of the two of you
with your days-together count (from the day you set), free and instant. If you both tick “Let AI use my photo”, either of you
can ask for an AI-drawn couple portrait instead.

The AI drawing runs through `api/couple-portrait.js`, which calls Google's Gemini image model. To switch it on:

1. Create a key at <https://aistudio.google.com/apikey> (image generation may be billed by Google — check their pricing).
2. In the Vercel project settings add an environment variable `GEMINI_API_KEY` with that key, then redeploy.
3. Optional: set `GEMINI_IMAGE_MODEL` to use a different image model (default `gemini-2.5-flash-image`).

Until the key exists the function answers “not configured” and the app keeps the collage. The function only accepts signed-in
TW users (it checks their Firebase ID token), allows one portrait per person per minute, and never stores the photos.

## Good to know

- Messages, notes and snaps are stored in Firebase and protected by the rules above; they are **not** end-to-end encrypted.
- Snaps are one-time photos stored in Firestore (a small `snaps` record plus the photo in `snapImages`). The receiver's
  app deletes both once the snap is closed, and the sender can unsend before it is opened. The rules only let the
  receiver read the photo after the snap is marked as viewed. Treat it as best effort: a modified client could still
  save the image while it is open.
- The Firebase web API key in `index.html` is meant to be public. Restrict it to your site's domains in the Google
  Cloud console (APIs & Services → Credentials) and consider enabling Firebase App Check.
- AI-flavoured features fall back to built-in templates until `AI_ENDPOINT` in `index.html` points at your own proxy
  that holds the API key server-side.
- Pokes, notes and messages only notify while TW is open in the background. True push notifications need Firebase
  Cloud Messaging.
