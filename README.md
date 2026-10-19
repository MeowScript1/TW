# TY

A private little web app for two people: pairing by code, live chat with reactions, pokes and love notes,
couple trivia, daily tasks, view-once or kept photo "snaps", and an installable PWA. No build step — it is a
static site backed by Firebase (Auth, Firestore, Storage).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app (markup, styles and the module script). `our-little-world.html` just redirects here for old links. |
| `service-worker.js`, `manifest.webmanifest`, `icon*.svg/png` | PWA: offline shell, install metadata, icons. |
| `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc` | Firebase security rules and CLI config (project `aytt-677b4`). |
| `vercel.json` | Security headers for the Vercel deployment. |
| `ty-local-app/Start TY.command` | Double-click on a Mac to serve this folder on `http://localhost:8765`. |

## Run it locally

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://localhost:8765>. Sign-in and sync talk to the real Firebase project, so use real accounts there.

## Deploy

The site deploys from the repo root on Vercel. **The security rules are not part of that deploy** — publish them
with the Firebase CLI whenever `firestore.rules` or `storage.rules` change:

```bash
firebase deploy --only firestore:rules,storage --project aytt-677b4
```

The first Storage deploy may ask to grant the Firebase Rules service agent access to Firestore; say yes (the snap
rules look up the couple's members in Firestore).

## Good to know

- Messages, notes and snaps are stored in Firebase and protected by the rules above; they are **not** end-to-end encrypted.
- View-once snaps are deleted (file and record) by the receiver's app once the snap is closed. Anyone holding the
  download link before that could still fetch the image, so treat "view once" as best effort.
- The Firebase web API key in `index.html` is meant to be public. Restrict it to your site's domains in the Google
  Cloud console (APIs & Services → Credentials) and consider enabling Firebase App Check.
- AI-flavoured features fall back to built-in templates until `AI_ENDPOINT` in `index.html` points at your own proxy
  that holds the API key server-side.
- Pokes, notes and messages only notify while TY is open in the background. True push notifications need Firebase
  Cloud Messaging.
