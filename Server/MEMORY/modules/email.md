---
doc: modules/email
covers:
  - src/services/email/**
  - scripts/gmail-oauth-token.js
  - docs/gmail-api-email.md
read_when: "changing email provider selection, templates, or what triggers an email"
depends_on: [modules/auth]
verified_against_commit: b5b0672
last_verified: 2026-10-07
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
| `scripts/gmail-oauth-token.js` (`npm run gmail:token`) | One-time: mints the refresh token from a Desktop-type OAuth client |
| `docs/gmail-api-email.md` | The Google Cloud setup, step by step |

## Facts worth knowing before touching email

- **Free Render blocks SMTP** (ports 25/465/587, since 2025-09-26). Locally
  SMTP works, so a reset that "works on my machine" proves nothing about
  production. Production uses `EMAIL_PROVIDER=gmail-api` with
  `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN` (all
  `sync: false` in `render.yaml`; see [12-CONFIG-AND-ENV.md](../12-CONFIG-AND-ENV.md)).
- **The Google OAuth app must be *published*.** In Testing mode, refresh
  tokens expire after 7 days and mail silently stops a week after setup.
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
