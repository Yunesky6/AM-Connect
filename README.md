# AM Connect

Aurora Mechanical's field HVAC checklist app. Techs fill out the inspection checklist on phone, tablet, or PC — including fully offline in the field — and it syncs to a central server automatically once back online.

## What's included

- `public/` — the installable app (PWA): home screen with a list of forms, offline caching, signature capture, sync queue
- `public/forms.js` — every form in the app is defined here as data (not code) — see "Adding a new form" below
- `server.js` — backend that receives and stores submissions (Node/Express)
- `admin.html` (served at `/admin`) — table of everything submitted, filterable by form
- `data/submissions.json` — where submissions are stored (swap for a real database later if volume grows)

## Adding a new form

The app opens to a home screen listing every form defined in `public/forms.js`. To add another form (e.g. a different checklist or inspection type), a new entry gets added to the `FORMS` array in that file — each form is just a title, an icon, and a list of sections/fields (text boxes, dropdowns, pass/fail checklists, signature, etc.). No other file needs to change; the app renders whatever's in that list automatically, including offline support and syncing.

Just tell me what the new form should cover and I'll add it.

## How offline works

- The service worker caches the entire app on first load, so it opens with zero signal.
- Submitting while offline saves the checklist to the device (localStorage) instead of failing.
- The app checks connectivity automatically (on reconnect, and every 30s) and pushes any queued checklists to the server the moment it's back online — no action needed from the tech.
- "Save Draft" lets a tech pause mid-checklist and resume later on the same device, including their Pass/Fail/N-A answers and signature.
- Every submission also generates a PDF that downloads straight to the device (`public/pdf.js`, using the vendored `public/vendor/jspdf.umd.min.js` — bundled locally rather than loaded from a CDN so it still works with literally zero connectivity, no wifi or hotspot at all). That PDF is the fallback for techs whose tablet never gets online in the field: they can open it from their device's Files/Downloads and attach it to an email manually whenever they do get signal, instead of relying on the automatic sync.

## Photos

Any form can include a `{ type: 'photo', name, label }` field in `public/forms.js` — it renders an "Add Photo" button that opens the device camera directly on phones/tablets (or a normal file picker on desktop), supports multiple photos with a thumbnail grid and per-photo remove, and embeds them into the generated PDF automatically. Photos are resized and compressed client-side before storage so a full submission with several photos stays reasonably sized offline.

The two current forms (HVAC Inspection, WSHP Startup) don't use this yet — it's there for the next form that needs it.

Because photos are much larger than text, the offline queue and saved drafts moved from localStorage to IndexedDB (in `public/app.js`), which has a far higher storage ceiling in the browser — this happened transparently and doesn't change how anything behaves, it just means the app can hold a lot more queued/offline data reliably.

## Checklist completion

- Each Pass/Fail/N-A item is unanswered by default (no pre-selected value) — techs must explicitly tap one for every item.
- A progress card at the top of the form shows a live percentage, "X of Y checks," and a green progress bar.
- Pass = green, Fail = red, N/A = gray, both in the app and in the generated PDF.
- Submit is blocked until every checklist item has an answer (required text fields are still enforced separately via normal form validation).

## Running it locally

```bash
npm install
npm start
```

Then open:
- `http://localhost:3000/` — the checklist app
- `http://localhost:3000/admin` — submitted checklists

## Installing on a phone/tablet (once deployed)

- **iPhone/iPad (Safari):** open the app URL → Share button → "Add to Home Screen." Icon and name ("AM Connect") appear on the home screen, opens full-screen, works offline.
- **Android (Chrome):** open the app URL → menu → "Install app" (or a banner will prompt automatically).
- **PC:** works in any browser normally; Chrome/Edge also offer "Install" from the address bar for an app-like window.

## Deploying so the whole team can reach it

This needs to run somewhere reachable from the field (not just your laptop). Easiest options, roughly by effort:

1. **Render / Railway / Fly.io** — connect this folder as a Git repo, they build and host it for you, gives you a public HTTPS URL. Free/cheap tier is enough to start.
2. **A small VPS** (DigitalOcean, Linode, etc.) — run `npm start` behind a process manager (pm2) and a reverse proxy (Caddy/Nginx) for HTTPS.
3. **Your own office server/NAS** — works fine for a single-location shop; techs connect over the internet or VPN.

HTTPS is required for the offline/installable features to work — all three options above give you that.

## Growing it later

- Swap `data/submissions.json` for a real database (Postgres/SQLite) once you're past a handful of submissions a day — the `/api/submissions` routes are the only place that needs to change.
- Add login/auth before opening this up beyond your own network.
- Add photo attachments to the checklist (camera capture + upload) — the form and offline queue are already structured to support additional fields.
