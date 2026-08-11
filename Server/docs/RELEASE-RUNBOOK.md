# Release runbook — audit remediation branch

**Branch:** `security/audit-remediation` · **43 commits** · covers both stacks.

This release closes every finding in `Server/docs/AUDIT.md` and `Web/docs/AUDIT.md`.
It contains **a mandatory database migration, a security control that is now
enforced, and two major dependency upgrades**. Read this before deploying.

> **Do not deploy during a competition.** Pick a window with no fixtures and
> have the previous Render deploy ready to roll back to.

---

## 1. The one thing that will bite you

**Migration 003 is mandatory, and HIGH-3 stays broken until it runs.**

`Score` documents are keyed `{teamId, gender, ageGroup, competition, competitionType}`
as of this release. The old index omitted `competitionType`.

`connection.js:55` sets `autoIndex: config.isDevelopment()` — so **in production
Mongoose does not create the new index**. Until the migration runs you get the
worst of both worlds: the application code expects the new key, while the old
unique index is still enforced and **rejects any attempt to score a team in a
second category** with `E11000`.

Verified against a production-like database:

| State | Scoring a team in Competition II |
|---|---|
| Before migration | **rejected**, `E11000` |
| After migration | accepted; a true duplicate is still rejected |

```bash
cd Server && npm run migrate:status   # see what is pending
cd Server && npm run migrate:up       # apply
```

**The migration refuses to run if it would lose data.** It groups existing
documents by the new identity and aborts, printing the offending ids, if any
collision exists. Historical documents that merged two categories **cannot be
split automatically** — the per-slip category was overwritten at write time and
is genuinely gone; those results must be re-entered by hand. Setting
`ALLOW_LOSSY_SCORE_MIGRATION=true` overrides the abort; only do that after
taking a restorable dump and accepting that outcome.

**Take a database backup before running it.** The migration drops an index; a
Mongo index change is not in-place and `down()` deliberately restores the old
index as non-unique so a rollback cannot wedge a working database.

---

## 1b. CSRF touches every unauthenticated POST — including login

Turning CRIT-3 on broke **judge login** and **silent token refresh** during
verification, and neither was caught by 321 passing tests, lint or a clean
build — because none of them renders the app and clicks Sign In.

The rule to remember: **a POST with no Bearer token is exactly what CSRF
rejects**, and login is the canonical example (you do not have a token until it
succeeds). Anything posting with raw `axios` instead of the `api` instance
sends no `X-CSRF-Token` and gets a 403.

Both are fixed, and `api-client.js` is now the only file importing axios
directly. If you add a new call, put it on the `api` instance. If you ever see
`403 CSRF token missing`, this is why.

## 1c. The cookies are cross-site in production — and nothing local shows it

**Read this before changing any cookie option.**

`render.yaml` deploys the SPA and the API as two services:
`mallakhamb-web.onrender.com` and `mallakhamb.onrender.com`. **`onrender.com` is
on the Public Suffix List**, so those are two different registrable domains and
**every SPA→API request is cross-site**.

Both the auth cookies and the CSRF cookie were `SameSite=Strict`, which a
browser will not return on a cross-site request. That had two effects, one
silent and one fatal:

- **Silent:** the httpOnly access/refresh cookies were stored and never sent, so
  cookie auth, `POST /auth/refresh` and `GET /auth/me` have been inert in
  production since Phase 2A. The app has been running on the backward-compat
  Bearer token in sessionStorage the whole time.
- **Fatal, once CSRF is on:** the double-submit check needs the cookie half.
  Login is a POST with no Bearer token yet (see §1b), so it is not exempt — and
  with the cookie never returned, **every login would 403**.

Fixed by `crossSiteCookiePolicy()` in `src/utils/security/cookie.util.js`, the
single source for the `secure`/`sameSite` pair. `csrf.middleware.js` now reuses
it instead of declaring its own literal.

**Operational rules:**

- `SameSite=None` and `Secure` **travel together** — browsers drop the cookie if
  one is set without the other. Do not set them independently.
- **Never set `CSRF_ENABLED=false` while cookies are `SameSite=None`.** That is
  the genuinely unsafe combination; the double-submit check is what makes
  cross-site cookies acceptable. If you must disable CSRF as a rollback, treat
  it as temporary and understand you are accepting CSRF exposure.
- **This class of bug cannot be caught locally.** `localhost:5173 →
  localhost:5000` is *same-site*, so dev, tests, lint and build all pass while
  production is broken. The only real verification is a browser login against
  the deployed origins — see §4.

## 2. Environment variables

| Variable | Default | Action |
|---|---|---|
| `CSRF_ENABLED` | **`true`** (changed) | Leave on. Set `false` only if a client genuinely cannot send `X-CSRF-Token`. |
| `ENABLE_DEBUG_ROUTES` | `false` (new) | Leave unset. `/api/debug/*` used to be live in staging on `NODE_ENV !== 'production'`; it now requires this flag and is never available in production. |
| `ALLOW_LOSSY_SCORE_MIGRATION` | unset | Only for the migration escape hatch above. |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_DURATION_MINUTES` | `5` / `15` | Previously inert; **now actually enforced**. Confirm the values suit you. |
| `BCRYPT_ROUNDS` | `12` | Now also used by the password-reset path, which previously hardcoded 10. |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | unset | **Now declared in `render.yaml` as `sync: false`.** Declaring is not setting — confirm real values exist in the Render dashboard or entry-fee payment and webhook HMAC verification fail at runtime. |
| `REDIS_URL` | unset | Optional. Without it, cross-instance JWT invalidation falls back to an in-memory store that is per-process and resets on every deploy. |
| `JWT_EXPIRES_IN` | `24h` | Now declared explicitly. This is the lifetime users actually get, since the 15-minute cookie is not usable cross-site (§1c). |

---

## 3. Deploy order

`render.yaml` defines two independent services that build and go live at
different times, so any change needing simultaneous server and client behaviour
has a broken window. **This release is deliberately ordered to avoid one:**

1. **Server first.** Everything server-side is backward compatible with the
   currently deployed web bundle — the judge client already sends
   `Authorization: Bearer`, which the CSRF middleware exempts, and the
   unversioned `/api/*` paths are still served alongside `/api/v1/*`.
2. **Run migration 003.** See §1.
3. **Web second.** The new client sends `X-CSRF-Token` and calls
   `GET /api/auth/me`; both endpoints must already exist server-side.

Deploying Web first is the one ordering that breaks: its CSRF header would hit
a server that does not issue tokens at `/api/csrf-token`.

---

## 4. Smoke tests after deploy

```bash
# Health, both prefixes
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/health/live      # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/v1/health/live   # 200

# The two CRIT-2/CRIT-4 leaks must be closed
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/public/judges          # 401
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/public/submitted-teams # 401

# The CRIT-1 write path must reject anonymous callers
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<api>/api/public/save-score \
  -H 'Content-Type: application/json' -d '{}'                                # 401

# COP rules are public and cacheable
curl -s https://<api>/api/public/cop-rules | grep -c pointCeilings           # 1

# Debug routes must be gone
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/debug/env         # 404

# The cookie policy must be cross-site capable (§1c).
# BOTH 'SameSite=None' and 'Secure' must appear. Either alone means broken login.
curl -si https://<api>/api/csrf-token | grep -i 'set-cookie'
# expect: csrf-token=...; Path=/; Secure; SameSite=None

# The team roster must no longer be anonymously readable
curl -s -o /dev/null -w '%{http_code}\n' https://<api>/api/teams/<any-team-id>  # 401
```

**By hand, in this order:**

0. **Log in as any role, in a real browser, on the deployed web origin.**
   Do this *first* — it is the gate for everything else. This is the only check
   that can detect the §1c cross-site cookie failure, because no local run,
   test, lint or build reproduces it. A `403 CSRF token missing` here means the
   cookie policy is wrong; see §6 for the immediate rollback.
1. **Judge login, then submit a slip.** The single most important path. Confirm
   the score appears in Panel Review for the other judges.
2. **Score the same team in a second category.** This is the HIGH-3 fix and the
   thing the migration enables — if it errors, the migration did not run.
3. **Admin: lock and unlock an age group.** This was returning 500 before this
   release (`BaseRepository.updateMany` did not exist) and has never worked.
   Then **unlock a single score as a superadmin** from the Scoring screen: the
   admin router's `/scores/unlock` had no `:scoreId` segment while its handler
   read `req.params.scoreId`, so that path passed `undefined` and could never
   have unlocked anything. Now `/scores/:scoreId/unlock`, matching the client.
4. **Send one real e-mail** — an OTP is easiest. `nodemailer` went 7.x → 9.x, a
   breaking major on the transport. It is now covered by
   `tests/integration/email/smtp-delivery.test.js`, which drives the app's own
   EmailService through a **real SMTP conversation** (handshake, AUTH, DATA)
   against a local server — so the protocol itself is proven.
   **What that cannot prove is your provider**: Gmail or Resend can still
   reject on credentials, SPF/DKIM, sender reputation or rate limits. One live
   send is all that is needed, and it is the only step here that requires
   production secrets.
5. **Click through each role's dashboard.** `react-router` went 6.x → 7.x.
6. **Open the app in a second tab.** It should stay signed in — that is the new
   `/auth/me` rehydration (MED-W1).
7. **Log out in one tab**; the other should drop its session (HIGH-W4).

---

## 5. What changed that operations should know

- **Account lockout is now real.** Five failed logins locks an account for 15
  minutes, judges included. Support will start seeing "account locked" reports
  that were previously impossible. There is no admin unlock UI — clear
  `loginAttempts`/`lockUntil` on the user document, or wait it out.
- **Judge login is rate limited**, keyed by **username**, not IP. A venue behind
  one NAT address will not throttle itself; guessing against one account will.
- **CSRF is enforced** for cookie-authenticated writes. Bearer requests are
  exempt, which is why the deployed client keeps working.
- **Correlation IDs** are now generated and returned as `X-Correlation-ID`. Use
  them when tracing a report through the logs.
- **Every route is also served under `/api/v1`.** The unversioned paths remain
  as aliases; retire them one release after clients move over.

---

## 6. Rollback

The application code is safe to roll back at any point — nothing depends on the
new index existing.

**If login 403s after deploy (smoke test 4.0 fails):** that is the §1c cookie
policy, and it locks every user out of every role at once, so treat it as an
outage rather than a bug to debug in place.

The fastest mitigation is `CSRF_ENABLED=false` in the Render dashboard, which
restarts the service and takes effect without a redeploy. **Understand the
trade:** cookies remain `SameSite=None` while the double-submit check is off, so
you are accepting CSRF exposure to restore access. Authenticated writes still
carry a Bearer token, which is what the app actually runs on. Treat it as
temporary, and fix the cookie policy rather than leaving the flag off.

Reverting the deploy also works and is cleaner if you are not mid-event, since
CSRF is not mounted on the previous release at all.

**The migration is the exception.** After `migrate:up`, a rollback to the
previous release leaves the new index in place, which is harmless: the old code
writes documents that satisfy it. Do **not** run `migrate:down` to "clean up"
unless you are also reverting the data, because the old code will then merge
categories again and destroy Competition I results a second time.

If you must roll the migration back: `npm run migrate:down` restores the old
index as **non-unique** on purpose, so it cannot fail to build against
multi-category data.

---

## 7. Verification baseline

```
Server: 283 tests / 22 suites · 0 vulnerabilities
Web:     97 tests / 11 files  · 0 lint errors · 0 vulnerabilities · clean build
```

Updated 2026-08-11 by the cross-stack second-pass audit (see `docs/AUDIT.md`).
**Its headline finding is §1c, and the baseline above cannot prove it** — the
suites were fully green while production cookie auth was inert and login would
have 403'd on the first CSRF-enabled deploy. Smoke test 4.0 is the only check
that covers it.

Beyond the suites, this release was verified by running things rather than
trusting green checkmarks:

- **The server boots** against a live database and serves — health on both
  route prefixes, COP rules, CSRF tokens, a 401 on a guarded route, a 404
  handler, and correlation IDs in the logs.
- **Migration 003 was run** against a production-like index state: second-category
  scoring blocked before, allowed after, true duplicates still rejected, and the
  collision abort path fires.
- **The web app was driven in a browser** through judge login. This found two
  bugs that every test, the linter and a clean build all missed — see §1b.
- **Socket.IO was exercised with a real client**: auto-join, panel broadcast,
  identity stamping, and a cross-category judge refused.

**Web coverage is ~8% overall** (`npm run test:coverage`). The utilities and
middleware are covered; the page components and form validators have no tests
at all. That is pre-existing and much wider than this branch — worth knowing
before assuming a green suite means the UI is safe.

Run both suites **sequentially, not concurrently** — vitest's fork workers time
out under contention and produce failures that look like real regressions.
