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

## 2. Environment variables

| Variable | Default | Action |
|---|---|---|
| `CSRF_ENABLED` | **`true`** (changed) | Leave on. Set `false` only if a client genuinely cannot send `X-CSRF-Token`. |
| `ENABLE_DEBUG_ROUTES` | `false` (new) | Leave unset. `/api/debug/*` used to be live in staging on `NODE_ENV !== 'production'`; it now requires this flag and is never available in production. |
| `ALLOW_LOSSY_SCORE_MIGRATION` | unset | Only for the migration escape hatch above. |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_DURATION_MINUTES` | `5` / `15` | Previously inert; **now actually enforced**. Confirm the values suit you. |
| `BCRYPT_ROUNDS` | `12` | Now also used by the password-reset path, which previously hardcoded 10. |

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
```

**By hand, in this order:**

1. **Judge login, then submit a slip.** The single most important path. Confirm
   the score appears in Panel Review for the other judges.
2. **Score the same team in a second category.** This is the HIGH-3 fix and the
   thing the migration enables — if it errors, the migration did not run.
3. **Admin: lock and unlock an age group.** This was returning 500 before this
   release (`BaseRepository.updateMany` did not exist) and has never worked.
4. **Send one real e-mail** — password reset or OTP. `nodemailer` went 7.x → 9.x
   (a breaking major). The API contract was verified, but not a live SMTP
   handshake against your provider.
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
Server: 216 tests / 15 suites · 0 vulnerabilities
Web:     86 tests / 10 files  · 0 lint errors · 0 vulnerabilities · clean build
```

Run both suites **sequentially, not concurrently** — vitest's fork workers time
out under contention and produce failures that look like real regressions.
