---
doc: 10-AUTH-AND-SECURITY
covers:
  - src/contexts/AuthContext.jsx
  - src/contexts/AuthProvider.jsx
  - src/middleware/protected-route.jsx
  - src/utils/auth/**
  - src/pages/shared/ForgotPassword.jsx
  - src/pages/shared/ResetPassword.jsx
  - src/pages/shared/NotFound.jsx
  - src/components/auth/AuthLoadingSpinner.jsx
read_when: "changing login/logout/session behavior, route guarding, cross-tab sync, or the password-reset screens"
depends_on: [04-STATE-MANAGEMENT, 08-API-INTEGRATION]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Session model in one paragraph

Auth state lives in `AuthProvider` (`user`, `userType`, `loading`,
`login()`, `logout()`), exposed via `AuthContext`/`useAuth()`. **Roles keep
independent, parallel sessions** — which session is "current" is derived
from the URL path (`getRoleFromPath`), not from a single global flag, so an
admin session in one tab and a coach session in another (or even the same
browser) coexist without interfering. The credential of record is an
httpOnly cookie set by the server; client-side storage
(`sessionStorage`, via `obfuscatedStorage`) is a **cache** of the user
object and a legacy bearer-token copy, not the source of truth — see
"Obfuscation is not encryption" below for exactly what that protects.

## `secureStorage` is a deprecated shim — read `obfuscatedStorage.js`

`src/utils/auth/secureStorage.js` is a 7-line re-export:
```js
export { obfuscatedStorage, secureStorage } from './obfuscatedStorage.js';
```
All real logic is in `src/utils/auth/obfuscatedStorage.js`. Every import of
`secureStorage` elsewhere in the app (including tests) resolves to the same
object as `obfuscatedStorage`.

## Obfuscation is not encryption — read this before touching storage

`obfuscatedStorage.setItem`/`getItem` (`obfuscatedStorage.js:59-85`)
AES-encrypt (via `crypto-js`) every value written to `sessionStorage`, using:
```js
const getEncryptionKey = () =>
  import.meta.env.VITE_STORAGE_KEY || 'mallakhamb-india-2026';
```
This is **real AES encryption, mechanically** — and **zero secrecy in
practice**, and the module's own header says so explicitly (not an
undocumented risk):
1. `VITE_*` env vars are inlined by Vite into the built JS bundle as plain
   string literals at compile time. Whatever `VITE_STORAGE_KEY` is set to
   ships to every client, visible to anyone who opens devtools or downloads
   the JS. Setting a "strong random key" does not change this.
2. It's one **fixed passphrase**, identical for every user and session —
   not a per-user or per-session secret.
3. Any script with same-origin access (including injected XSS) has the same
   import graph as the app and can decrypt exactly the same way.

**What this actually defends against**: casual glance at the DevTools
Storage tab (shows ciphertext, not an obviously-a-JWT string), and naive
automated scraping that blind-greps `sessionStorage` for JWT-shaped strings
without knowing to decrypt. **What it does NOT defend against**: the
browser's own user deliberately inspecting the value (trivial — one console
call, same key), XSS (origin-equivalent access), or anyone who has the
bundle (everyone who loaded the page).

**History** (`obfuscatedStorage.js:6-38`): the key used to also mix in a
browser fingerprint (screen size, timezone, UA prefix). That added no real
security (an on-origin attacker reads the same values regardless) but made
the key *volatile* — a monitor change or DST boundary crossing silently
broke decryption of every prior entry ("Malformed UTF-8 data"), logging the
user out. Fixed by dropping the fingerprint for a flat constant, trading
illusory hardening for read-path stability — regression-tested by
`obfuscatedStorage.test.js` ("should derive a key that survives screen and
timezone changes"). The file was renamed from `secureStorage` →
`obfuscatedStorage` specifically "to make the actual security posture
explicit and prevent false confidence."

**Documentation friction**: `README.md` and `docs/web-guide.md` still frame
`VITE_STORAGE_KEY` as something to "set a random value per environment" /
"CHANGE IN PRODUCTION," implying key secrecy is a meaningful hardening step.
It isn't, against the threat model that matters (the browser's own user, or
XSS) — the key ships in the bundle regardless of its value. Not wrong
exactly (a random key does stop guessing the literal default string without
opening the bundle) but overstates the payoff.

## `obfuscatedStorage.js` — full export map

| Export | Contract | Location |
|---|---|---|
| `setItem(key, value)` | AES-encrypts, writes to `sessionStorage[key]`; on encrypt error, logs and drops the write (no plaintext fallback) | `:59-67` |
| `getItem(key)` | Reads + decrypts; `null` if missing/blank; on decode failure **evicts** the key and returns `null` | `:69-85` |
| `removeItem(key)` | `sessionStorage.removeItem(key)` | `:87-89` |
| `clearForRole(role)` | Removes `${role}_{token,user,current_competition,selected_level}` **plus** legacy un-prefixed `token`/`user`/`userType` (always, any role) | `:97-106` |
| `clear()` | `sessionStorage.clear()` — every role | `:112-114` |
| `secureStorage` | `= obfuscatedStorage` (deprecated alias) | `:121` |

## `tokenUtils.js` — full export map

| Export | Contract | Location |
|---|---|---|
| `isTokenExpired(token)` | `true` if no token/no `exp`/decode throws/now ≥ `exp*1000 − 30000` (30s buffer). Decodes via `jwt-decode` — **decode only, no signature verification**. Anything that throws on decode is treated as expired (fail-closed) | `:4-20` |
| `getTokenData(token)` | `null` if no token or expired; else the decoded payload | `:22-30` |
| `getCompetitionIdFromToken(token)` | `getTokenData(token)?.competitionId ?? null` — used by `api-client.js` to attach `x-competition-id` | `:32-35` |

Because verification never happens client-side, any client-side "is this
token valid" check is advisory UX only — the server is the actual authority
on every request; a forged-but-well-formed token would pass `isTokenExpired`
and only fail at the server.

## `roleFromPath.js` — the one source for path↔role mapping

| Export | Contract | Location |
|---|---|---|
| `ROLE_PREFIXES` | Ordered `[{prefix, role, loginPath}]` — `/superadmin` **must precede** `/admin` in the list (prefix collision otherwise) | `:18-24` |
| `getRoleFromPath(pathname)` | First matching prefix's role, or `null` | `:33-37` |
| `getLoginPathFromPath(pathname)` | First matching prefix's login path, or `'/'` | `:45-49` |
| `getLoginPathForRole(role)` | Exact-role lookup, or `'/'` | `:57-61` |

Used identically by `AuthProvider` (which role's storage to read),
`protected-route.jsx` (which role a route requires / where to redirect), and
`api-client.js` (which token to attach to a request, keyed off
`window.location.pathname`). One definition, three consumers — changing the
prefix list changes all three at once. `roleFromPath.test.js` locks in that
`/superadmin` and `/admin` never collide to the same storage key.

**A fourth consumer, and a real shipped bug it fixed**: `getRoleFromPath`
must also resolve a **bare prefix** (`/superadmin`, no trailing path) the
same as a full pathname — `roleFromPath.test.js:33-39` names this
requirement explicitly because `AdminScoring.jsx` derives its Socket.IO
storage key from `RouteContext`'s `routePrefix`, which is a bare prefix,
not a full `location.pathname`. This is a named regression test
(`roleFromPath.test.js:42-61`, "socket storage key derivation
(AdminScoring)") for a bug that actually shipped: `AdminScoring.jsx` used
to compute its token-storage key with
`routePrefix === '/superadmin' ? 'admin_token' : 'admin_token'` — **both
branches identical** — so a superadmin's live-scoring socket handshake went
out with the wrong key (a superadmin session stores under
`superadmin_token`, not `admin_token`, so the lookup came back empty). Also
recorded in `docs/AUDIT.md`'s "W-1" second-pass section (2026-08-11). Fixed
by deriving the storage key via `getRoleFromPath(routePrefix)` instead of
the broken ternary. If you touch how any judge/admin/superadmin screen
derives its socket auth key, use `getRoleFromPath` on whatever prefix
you have — never hand-roll a role comparison again.

## `authEvents.js` — cross-tab sync, full export map

| Export | Contract | Location |
|---|---|---|
| `authEventBus` | Singleton `EventTarget`, in-page (not cross-tab) signaling | `:14` |
| `AUTH_EXPIRED` | `'auth:expired'` event name | `:17` |
| `dispatchAuthExpired({userType, reason})` | Dispatches `AUTH_EXPIRED` with `detail:{userType, reason, redirectTo}` (resolved via `getLoginPathForRole` at dispatch time) | `:26-36` |
| `broadcastLogout(role)` | Posts `{type:'logout', role}` on a `BroadcastChannel('mallakhamb:auth')`; no-op if unsupported/no role; swallows post errors | `:65-72` |
| `subscribeToAuthBroadcast(handler)` | Adds a listener calling `handler(event.data)` when `data.type` is truthy; returns an unsubscribe fn | `:79-87` |

**No-BroadcastChannel-support fallback is a silent no-op** — the channel
constructor is guarded (`typeof BroadcastChannel !== 'undefined'` + try/
catch); on failure `authChannel` stays `null`, `broadcastLogout` just
returns, `subscribeToAuthBroadcast` returns a no-op unsubscribe immediately.
**No polyfill, no alternate cross-tab mechanism.** In an unsupported
browser, another tab only discovers a logout reactively — when one of its
own requests 401s and the axios interceptor's silent-refresh-then-
`AUTH_EXPIRED` path fires locally (see [08-API-INTEGRATION.md](08-API-INTEGRATION.md)) — never proactively.

This replaced a `window.addEventListener('storage', ...)` approach that
**could never have worked**: the `storage` event only fires for
`localStorage` writes, and `obfuscatedStorage` writes `sessionStorage` —
cross-tab logout was silently broken for as long as that was the mechanism.

**How the cross-tab test proves it actually crosses tabs**:
`authEvents.crosstab.test.js` cannot use one `BroadcastChannel` instance
for both ends — a channel never receives its own `postMessage` — so it
opens a **second, independent** `BroadcastChannel('mallakhamb:auth')` to
stand in for "another tab" (`:11-15, 44-49`). The file's header notes a
prior fixed-timeout version of this test "passed in isolation and failed
once the full suite ran in parallel," replaced with a `waitFor()` polling
helper (`:28-35`) — a documented flake precedent worth reusing if you ever
add another `BroadcastChannel`-based test. Also directly verified: a
malformed message (`{nope:true}`, `null`) is ignored rather than crashing a
subscriber (`:90-100`), and `broadcastLogout(undefined)` must not throw
(`:102-104`).

## Full sequences

### Login → storage
1. A login form calls `AuthProvider.login(userData, token, role)`.
2. `login` writes `secureStorage.setItem('${role}_user', JSON.stringify(userData))` and, if a token is present, `secureStorage.setItem('${role}_token', token)`.
3. React state (`user`, `userType`) updates in the same call.

### Mount / rehydration (`AuthProvider`'s bootstrap effect)
1. Reads role-prefixed `secureStorage` keys for the URL-derived role first.
2. **Legacy migration**: if prefixed keys are empty, reads plain
   **`localStorage`** (not `secureStorage`) for un-prefixed legacy
   `token`/`user`/`userType`; if present, re-writes them via
   `secureStorage.setItem` under the role-prefixed keys and deletes the
   legacy `localStorage` entries.
3. If storage came up empty and the path isn't in `UNAUTHENTICATED_PATHS`
   (`/login`, `/register`, `/forgot-password`, `/reset-password`), calls
   `authAPI.me()` — cookie-based rehydration for a tab/storage-eviction case
   where the httpOnly cookie is still valid but `sessionStorage` is empty.
   Only a session whose returned `userType` matches the URL-derived role is
   adopted. A 401 here means genuinely logged out (the axios interceptor
   will already have attempted a silent refresh first).

### Route guard (`protected-route.jsx`)
1. Reads `secureStorage` directly (not context) for `${role}_token`/`${role}_user`, once per render — **not** via multiple reads that could observe different values within one render.
2. `isTokenExpired(token)` decides validity synchronously; an expired token is treated as absent for the redirect decision **in the same render** — no effect, no spinner-forever wait (renders must stay pure; storage writes don't trigger re-renders, so deferring the redirect decision to an effect would strand the user).
3. Actual token/user eviction for an expired token happens in a **separate** `useEffect`, decoupled from the render-time redirect decision.
4. Verified directly by `protected-route.test.jsx`'s dedicated `'MED-W2 — the render is pure'` suite (`:136-189`, separate from the main test block): a valid-token render calls `removeItem` zero times (`:141-156`); an expired-token render redirects immediately with no spinner (`:158-173`); eviction still happens, just via the effect (`:175-188`). The suite's own comment (`:141-148`) explains why this needed a dedicated regression test: React 19 StrictMode double-invokes renders, and a concurrent render could be discarded after a render-body side effect had already fired — a bug that would only show up under StrictMode, not a plain single render.
5. **There is a third render state**, not just "authenticated" vs. "redirect to login": when storage holds a valid, non-expired token/user but the React context hasn't caught up yet (e.g. `AuthContext` value is still `{user:null, userType:null}` immediately after a fresh login write), `protected-route.jsx` renders `AuthLoadingSpinner` rather than redirecting or rendering the protected content — confirmed by a dedicated test case (`protected-route.test.jsx:90-110`) asserting the spinner (`.animate-spin`) appears, not a redirect. Easy to miss reading the source in isolation; the test is what pins this down as an intentional third branch, not a race condition.

### Cross-tab logout
1. Logout gets a CSRF token (`ensureCsrfToken()`) and POSTs `/auth/logout`
   via **raw `fetch`** (not the axios `api` instance — going through `api`
   would re-enter the response interceptor and could trigger a silent
   refresh for the session being ended). Because this skips `api`'s request
   interceptor too, the CSRF header and `Authorization: Bearer` must be
   attached by hand — confirmed by `AuthProvider.test.jsx` asserting the
   `fetch` call carries `X-CSRF-Token`, `Authorization: Bearer <token>`, and
   `credentials:'include'`. See [Logout CSRF
   Trap-style hazard: a hand-rolled fetch that forgets either header 403s
   server-side while looking successful client-side (the `.catch` swallows
   it) — `AuthProvider.test.jsx:167-186` is the concrete proof, asserting
   the raw `fetch` call carries `X-CSRF-Token`, `Authorization: Bearer
   <token>`, and `credentials:'include'` all at once; its own comment
   (`:160-166`) spells out the failure mode in one sentence: *"a logout
   that emptied the tab and left the refresh cookie valid for its full
   lifetime."* Getting this test green required mocking `ensureCsrfToken`
   (`:44-46`) — the real implementation issues an axios GET that never
   settles under jsdom, which would make the suite depend on a 2-second
   bail-out in the logout handler rather than on the logout logic itself.
   **A test-methodology trap worth remembering**: an earlier version of the
   "clears state on logout" test passed *synchronously by accident*
   (`:135-138`) — the `apiConfig` mock was missing `getBaseUrl`, so the
   handler threw *before* reaching its `await fetch`, making an async
   handler look synchronous and the test pass for the wrong reason.
   Completing the mock exposed this and the test had to become
   `await act(async () => …)`.
2. Regardless of server outcome, clears locally:
   `secureStorage.clearForRole(role)` (role-prefixed keys + legacy
   un-prefixed keys, always) and `sessionStorage.clear()`.
3. Broadcasts `broadcastLogout(role)` so other tabs holding the same role
   drop their session too.
4. Navigates to the role-appropriate login page.

### Token expiry (reactive path)
1. `api-client.js`'s response interceptor (documented in
   [08-API-INTEGRATION.md](08-API-INTEGRATION.md)) fails a silent refresh on
   401 and calls `dispatchAuthExpired({userType, reason})`.
2. `AuthProvider` listens for `AUTH_EXPIRED` on `authEventBus`, clears the
   session (`clearForRole`, state reset), and navigates via React Router to
   `redirectTo`.
3. Two independent rotation/expiry mechanisms exist on the client, same as
   documented server-side: this reactive 401-triggered path, and the
   proactive `isTokenExpired` check in `protected-route.jsx`. They don't
   share code.

### Password reset — one component, two flows
`ForgotPassword.jsx` collects an email, calls `authAPI.forgotPassword(email)`
(`POST /auth/forgot-password`, raced against a 120s client timeout), then
navigates to `/reset-password` with router state `{email}`.

`ResetPassword.jsx` **branches purely on the presence of a `:token` URL
param** (`const isOTPMethod = !token`):
- **Token flow** (`/reset-password/:token`): copies the token into local
  state, strips it from the visible URL via `history.replaceState` (so it
  doesn't linger in browser history), skips straight to the password
  fields, submits via `authAPI.resetPassword(resetToken, password)` (→
  `POST /auth/reset-password/:token`, the Server's recently-fixed legacy
  flow — see Server MEMORY's `06-AUTH-AND-SECURITY.md`).
- **OTP flow** (`/reset-password`, no token, email pre-filled from
  `ForgotPassword`'s router state): email + 6-digit OTP → `authAPI.verifyOTP`
  (`POST /auth/verify-otp`) → only after verified, password fields render →
  `authAPI.resetPasswordWithOTP(email, otp, password)` (→ `POST
  /auth/reset-password-otp`).
- Shared: password `minLength:8` + confirm-match client-side; both consume
  `err.response.data.{attemptsRemaining, lockedOut, remainingSeconds}` to
  drive a live lockout countdown (reset to 3 / cleared when a client-side
  timer hits 0 — optimistic, doesn't re-check with the server); **both
  redirect to `/player/login` on success regardless of the account's
  actual role** (worth knowing — screen is role-agnostic but the success
  redirect is hardcoded to one role).
- **The two screens validate email differently.** `ForgotPassword.jsx`
  uses the shared `validateEmailFormat` from `@/validators/form.validator`
  (`ForgotPassword.jsx:148-151`). `ResetPassword.jsx` does **not** call the
  same helper — it uses its own inline regex,
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`ResetPassword.jsx:335`), which happens
  to be character-for-character identical to `validateEmailFormat`'s own
  regex today, but is a second hand-maintained copy that could silently
  diverge from the shared one on a future edit.
- **The OTP flow's `verify` step doesn't re-gate the final submit.**
  `handleVerifyOTP` (`:134-156`) calls `authAPI.verifyOTP` standalone and,
  only on success, flips `otpVerified` true — which conditionally renders
  the password fields (`:407-408`). But the final `onSubmit`
  (`:158-185`) does **not** call `verifyOTP` again; it posts
  `resetPasswordWithOTP(email, otp, password)` directly, trusting the OTP
  value still sitting in the form. If the OTP expires in the gap between
  clicking "Verify" and submitting the new password, nothing on the client
  catches that — the server is the only thing that can reject it at that
  point.
- Token flow strips the token from the visible URL/history immediately on
  mount via `window.history.replaceState(null, '', '/reset-password')`
  (`:108-113`), before the user even sees the password fields.
- `ForgotPassword.jsx` only ever produces the OTP path — nothing in the
  client generates a `/reset-password/:token` URL. That link comes from
  outside this component's control (a server-sent email template,
  presumably, or a legacy integration) — ⚠️ UNVERIFIED where it's actually
  generated; not found anywhere under `Web/`, would need to check
  `Server/src/services/**` for an email template referencing
  `reset-password/`.

## Stale / aspirational docs

- **`docs/CSP_NONCE_INTEGRATION.md` is entirely aspirational for this SPA.**
  Written in conditional language ("If you decide to serve the React
  frontend directly from the Node.js backend," "Recommended Approach") —
  nothing in `Web/` implements it. `index.html`'s CSP meta tag currently
  ships `'unsafe-inline' 'unsafe-eval'` for scripts with no nonce
  placeholder; `vite.config.js`'s dev headers only set `frame-ancestors
  'none'`. The doc's own "Current Setup Notes" concede that if static
  assets are served from an external static host (which — per [Cross-Site
  Cookie Topology] in Server memory — is exactly this deployment's shape,
  the SPA and API are different origins), backend CSP headers can't reach
  the HTML document at all. **Nonce-based CSP is topologically blocked
  under the current deployment, not just unimplemented.**
- **`docs/AUDIT.md`**: a living document that tracks its own remediation
  inline via a "Progress status" section, but the numbered "High"/"Medium"
  finding prose below it is written in **present tense describing the
  PRE-FIX state** and is not struck through. Specifically, **HIGH-W4**
  (`storage` event can't fire for sessionStorage — now fixed by
  `authEvents.js`'s BroadcastChannel), **MED-W1** (no `/auth/me` bootstrap —
  now implemented; the doc's own "still open" line correctly scopes what
  genuinely remains: whether to keep the Bearer-token copy in storage at
  all), and **MED-W2** (render-body storage mutation — now fixed, verified
  directly by `protected-route.test.jsx`) are all **already resolved**, but
  reading only the "## High"/"## Medium" headers without the progress log
  above them would suggest otherwise. **Read the progress log first.**
  **MED-W6 is now confirmed fixed** (judge login response logged raw): the
  raw `console.log` is gone from `UnifiedLogin.jsx`. Current code
  (`UnifiedLogin.jsx:278-289`) destructures `{token, judge, competition}`
  and logs only presence flags —
  `logger.log('Judge login response received', {hasToken: !!token,
  hasJudge: !!judge, hasCompetition: !!competition})` — routed through the
  project logger (dev-only, see [07-COMPONENTS.md](07-COMPONENTS.md) for
  the logger's `isDevelopment` gate), not a raw-payload `console.log`. The
  inline comment at the site names it as the MED-W6 fix explicitly.
  **The same stale-prose pattern also applies to HIGH-W3** (axios bypass
  losing silent-refresh/`AUTH_EXPIRED` handling on judge pages) — `AUDIT.md`
  line 43 states it's "now fully closed... Only the pre-auth login POST in
  UnifiedLogin and api-client.js itself still touch axios directly,
  deliberately," but the "## High" section prose above it (lines 135-154)
  still describes the seven-module bypass as a live, unresolved problem
  with no strikethrough. ⚠️ UNVERIFIED beyond what the progress log
  claims — `judge.api.js`'s own in-file comment corroborates it (built on
  `api`, not `publicApi`, "per the HIGH-W3 fix"), but the full seven-module
  list wasn't independently re-audited file-by-file this pass.

## Change guidance

- A new piece of session state: decide if it's per-role (goes through
  `secureStorage`/`ROLE_KEY_SUFFIXES` — you'll need to add the new suffix to
  `obfuscatedStorage.js`'s list so `clearForRole` actually clears it on
  logout) or genuinely global.
- A new "kick this session out" trigger: dispatch `AUTH_EXPIRED` via
  `dispatchAuthExpired`, don't invent a new mechanism.
- A new role: add it to `ROLE_PREFIXES` in `roleFromPath.js` — this alone
  propagates to `AuthProvider`, `protected-route.jsx`, and `api-client.js`.
  Order matters if the new prefix could collide with an existing one
  (mirror the `/superadmin`-before-`/admin` precedent).
- Never treat `obfuscatedStorage`/`secureStorage` as a place to put anything
  that would be bad for the browser's own user to read in plain text with
  one console call — it isn't secret from them.

## Related components (thin, documented fully in 07-COMPONENTS.md)
- `src/components/auth/AuthLoadingSpinner.jsx` — the spinner rendered by
  `protected-route.jsx`'s third state (see above). Pure presentational,
  sizes off `useResponsive()`.
- `src/pages/shared/NotFound.jsx` — the 404 catch-all (replaced a bare
  `<Navigate to="/">` per `AUDIT.md`'s "W-3"). Consumes
  `getLoginPathFromPath` from `roleFromPath.js` directly to offer a
  role-appropriate "Sign in" link when a dead URL had a recognizable role
  prefix — its one point of contact with this doc's subject matter.

## Open questions
- ⚠️ UNVERIFIED: exact `AuthProvider.jsx` line numbers for `login`/
  `handleLogout`/the bootstrap effect's legacy-migration branch — this
  report's narrative was partly reconstructed from `AuthProvider.test.jsx`
  behavior per the task's "tests are the spec" framing, not from re-reading
  the implementation line-by-line a second time.
- ⚠️ UNVERIFIED: where the `/reset-password/:token` email link is actually
  generated (not produced by any client code found — check
  `Server/src/services/**` for an email template referencing
  `reset-password/`).
- ⚠️ UNVERIFIED: HIGH-W3's full seven-module axios-bypass fix — corroborated
  by `judge.api.js`'s in-file comment and the progress log, not
  independently re-audited module-by-module.
