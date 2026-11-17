# Plan: the web app as a PWA (installable app)

Status: **plan only** (2026-11-17). Nothing here is built yet.

## Goal

Judges, scorers, coaches and players can **install** Mallakhamb India on a phone, tablet or laptop (home-screen icon, full screen, no browser bar) and get:

1. a fast start: the app shell loads from the device, not the network;
2. a clear **"You are offline"** state instead of a blank page or a browser error;
3. safe updates: a new release never reloads a judge's screen in the middle of a slip.

Not goals for the first release: offline scoring, push notifications, app-store listings.

## What already helps

| Already in place | Why it matters |
| --- | --- |
| React 19 + Vite 7 SPA with a static build | `vite-plugin-pwa` (Workbox) fits directly |
| `apple-touch-icon.png`, `theme-color` (light + dark), `favicon.svg` | iOS icon and the status-bar colour exist |
| Judge slip survives a refresh (localStorage autosave) | a dropped connection or a restart doesn't lose marks |
| Running order and scores arrive over Socket.IO, and screens re-read on focus and reconnect | stale screens heal on their own once back online |
| "Sign out?" on Back | Android's system Back in standalone mode goes through the same handler |

## What makes it harder (decide before building)

1. **Cookies on iPhone.** The SPA and API are on different sites, and iPhones block those cookies; requests fall back to the signed CSRF header and Bearer token. An installed iOS app keeps **its own storage, separate from Safari**: users sign in once more after installing, and the cross-site cookie problem is the same or worse. **Recommendation:** move to `app.` / `api.` on one owned domain first (see the Render custom domain / production domain work). Android and desktop installs do not need to wait.
2. **Never cache the API.** Scores, locks, CSRF tokens and sessions must always come from the server. A cached `GET /scores` on a judge's tablet is a wrong score on the panel. The service worker caches **only** the built static files.
3. **Updates mid-competition.** A service worker that takes over on its own can reload a judge's page in the middle of scoring. Use **prompt-to-update** (`registerType: 'prompt'`): a small "New version available — Reload" bar. On judge scoring and Scorer screens, show it only between athletes (no unsaved slip).
4. **CSP.** `index.html` carries a CSP meta tag, rewritten at build time. Add `worker-src 'self'` and `manifest-src 'self'`, and check that the service-worker registration script is covered by the hashed `script-src` (vite-plugin-pwa can inject an external `registerSW.js`, which `'self'` already allows).
5. **Hosting headers.** `sw.js` and `manifest.webmanifest` must be served with `Cache-Control: no-cache` (Caddy on OCI and Render static) so an update is seen at once. `_redirects` must not rewrite them (they are real files, so Render serves them first; check Caddy's `try_files` the same way).
6. **Razorpay in standalone mode.** Checkout opens in-page, which works. UPI app hand-off and the return are the risk: test on Android and iPhone before rollout.
7. **The Home page's forced 1280 viewport on phones.** It is unchanged in standalone mode. Check that the installed app opens on the role's dashboard, not on the marketing Home (`start_url`).

## Design

### Manifest (`vite-plugin-pwa` writes it)

- `name`: "Mallakhamb India", `short_name`: "Mallakhamb"
- `start_url`: `/?source=pwa`, `scope`: `/`, `display`: `standalone`, `orientation`: `any` (judges use tablets in landscape)
- `background_color` / `theme_color`: the dark ink token (the light theme keeps the meta tags)
- `icons`: 192, 512 and a **maskable** 512 PNG made from the brand mark (new assets), plus the existing apple-touch icon
- `shortcuts`: "Judge sign in" (`/judge/login`), "Live scores" (`/scores`)

### Service worker (Workbox `generateSW`)

| Request | Strategy |
| --- | --- |
| Built JS/CSS/fonts/images (hashed) | **precache** at install |
| Page navigations | `index.html` from the precache (SPA fallback); **denylist** `/api`, `/socket.io`, `/docs` |
| `/api/**`, `/socket.io/**`, Razorpay, OCR | **NetworkOnly**, never cached |
| Lazy Home assets (GSAP / three chunks, hero images) | StaleWhileRevalidate, capped size |

- `skipWaiting: false` and `clientsClaim: false`, with the prompt described above.
- A **kill switch**: keep a ready `sw.js` that unregisters itself and clears its caches, so a bad worker can be removed with one deploy.

### App changes

- `useOnlineStatus` hook + an **offline banner** in every shell ("You're offline — scores will update when you reconnect"). On the judge slip, Submit is disabled while offline, with that message (today it fails with a network toast).
- **Update bar** (`useRegisterSW` from `virtual:pwa-register/react`), held back while a slip has unsaved marks.
- **Install hint**: a dismissible "Install the app" button where the browser offers it (`beforeinstallprompt` on Android/desktop), and a one-line "Share → Add to Home Screen" note on iPhone. Show it to judges and coaches only, never during scoring.

## Phases

| Phase | Work | Size |
| --- | --- | --- |
| 0 | Decide: same-domain move first for iPhone (recommended), icon artwork, where the install hint shows | owner |
| 1 | Manifest + icons + `vite-plugin-pwa` (precache, NetworkOnly API) + CSP/header changes + kill switch | 1–2 days |
| 2 | Offline banner, update bar with the judge-slip guard, install hint | 1–2 days |
| 3 | Device checks (below) + an e2e spec: offline banner, no API response in the cache, update prompt | 1–2 days |
| Later | Offline slip queue (a slip saved offline, sent on reconnect). This needs care: the `__v`-guarded score merge and the 3-edit limit both have to hold. Push notifications (iOS needs 16.4+ and an installed app). | separate plan |

## Testing

- Chrome DevTools → Application: manifest valid, installable, service worker active, **Cache Storage holds no `/api` responses**.
- Real devices: Android Chrome (install, offline, update, Razorpay UPI); iPhone Safari 17/18 (Add to Home Screen, sign-in inside the installed app, Razorpay); iPad landscape (judge slip); desktop Chrome/Edge install.
- Live-scoring walk on an installed app: two judges + Senior Judge + Scorer; turn Wi-Fi off and on mid-athlete; the slip survives and the panel re-syncs.
- Release a dummy update while a slip is open: no reload until the slip is submitted.

## Rollout

- **Not on a meet day.** The December meets are 12–13 and 19–20 Dec; ship before 5 Dec (with the OCI cutover checks) or after 20 Dec.
- Ship phase 1 to staging first, install on test devices, then production.
- Rollback = deploy the kill-switch `sw.js`. Users on the old version get the fix on their next visit.
