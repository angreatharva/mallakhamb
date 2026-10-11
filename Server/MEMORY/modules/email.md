---
doc: modules/email
covers:
  - src/services/email/**
  - scripts/gmail-oauth-token.js
  - docs/gmail-api-email.md
read_when: "changing email provider selection, templates, or what triggers an email"
depends_on: [modules/auth]
verified_against_commit: cd66189
last_verified: 2026-10-11
---

The reset flow that triggers these mails is in
[06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md#forgot-password--otp--reset);
service internals in [modules/auth.md](auth.md#email--srcservicesemail).

## Files

| File | Role |
|---|---|
| `src/services/email/email.service.js` | Provider selection (`email.provider`: `nodemailer` default, `resend`, `gmail-api`), retry queue (3 tries), metrics, and `checkHealth()` |
| `src/services/email/email-provider.interface.js` | The interface every adapter implements (`sendEmail`, `verifyConfiguration`) |
| `src/services/email/nodemailer.adapter.js` | SMTP. Connect/greeting timeouts 10 s, socket 20 s (the 2-minute default turned a blocked port into a 6-minute hang across retries) |
| `src/services/email/resend.adapter.js` | Resend API. Needs a verified sending domain, which the project doesn't own yet |
| `src/services/email/gmail-api.adapter.js` | Gmail REST API over HTTPS (443). OAuth2 refresh token, exchanged for an access token cached until 60 s before expiry; MIME built with Nodemailer's `MailComposer`; sends as `EMAIL_USER`; scope `gmail.send` only; 10 s timeout; `fetch` injectable for tests |
| `src/services/email/templates/otp.template.js` | The reset code (`otp.service.js:generateAndSendOTP`) |
| `src/services/email/templates/password-reset.template.js` | The "password changed" notice after a successful reset (`otp.service.js:notifyPasswordChanged`) |
| `src/services/email/templates/notification.template.js` | Implemented, **zero callers** |
| `scripts/gmail-oauth-token.js` (`npm run gmail:token`) | One-time: mints the refresh token from a Desktop-type OAuth client, then **refreshes it once against the same client ID/secret before printing it** (so a later failure on Render can only mean the value changed in transit). Prints the token's length and the first 12 chars of the client ID to compare against Render. Reads `Server/.env` too; in PowerShell set `$env:GMAIL_CLIENT_ID`/`$env:GMAIL_CLIENT_SECRET` instead of the inline `VAR=value` form |
| `docs/gmail-api-email.md` | The Google Cloud setup, step by step |

## Facts worth knowing before touching email

- **Free Render blocks SMTP** (ports 25/465/587, since 2025-09-26). Locally
  SMTP works, so a reset that "works on my machine" proves nothing about
  production. Production uses `EMAIL_PROVIDER=gmail-api` with
  `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN` (all
  `sync: false` in `render.yaml`; see [12-CONFIG-AND-ENV.md](../12-CONFIG-AND-ENV.md)).
- **The Google OAuth app must be *published*.** In Testing mode, refresh
  tokens expire after 7 days and mail silently stops a week after setup.
- **A Google refresh token starts `1//`.** The adapter logs a startup
  `warn` ("GMAIL_REFRESH_TOKEN looks malformed", with the first 4 chars and
  the length) when it doesn't, or when it contains whitespace, quotes or a
  backslash. This happened for real (2026-10-07): a paste turned `//` into
  `\`, and Google answered only `invalid_grant: Bad Request`. A token-refresh
  failure now includes Google's `error_description`, which is what tells
  "Token has been expired or revoked." apart from "Bad Request" (a mangled
  value). Guarded by `gmail-api.adapter.test.js`.
- **Blank Gmail keys stop the server booting, even in development.** Config
  validation only demands the four Gmail values when `NODE_ENV=production`,
  but `GmailApiAdapter`'s constructor throws `missing configuration: …`
  whenever one is blank, and `EmailService` is a singleton built at boot.
  Since `8d0dc23`, `.env_example` sets `EMAIL_PROVIDER=gmail-api`
  (uncommented), so a fresh local `.env` copied from it won't start until the
  keys are filled in or the provider is set back to `nodemailer`. See
  [GOTCHAS.md](../GOTCHAS.md).
- **Sends are fire-and-forget from the reset flow.** A failed send never
  fails the HTTP request; it's logged and counted as
  `mallakhamb_emails_sent_total{outcome="failed"}`. No Grafana alert exists
  on that series yet.
- **`checkHealth()` dials the provider** (`verifyConfiguration`), cached
  5 min because `/api/health` is polled. A failure is reported as
  `degraded`, never `unhealthy`: the API still serves everything but mail,
  so it must not turn `/api/health` into a 503. See
  [11-OBSERVABILITY.md](../11-OBSERVABILITY.md).

Tests: `tests/unit/services/email/gmail-api.adapter.test.js`,
`tests/unit/services/email/email-health.test.js`.
