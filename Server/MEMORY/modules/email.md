---
doc: modules/email
covers:
  - src/services/email/**
read_when: "changing email provider selection, templates, or what triggers an email"
depends_on: [modules/auth]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

Full detail lives in
[modules/auth.md](auth.md#email--srcservicesemail) — this is a pointer
entry so `services/email/` has its own module doc per the directory-per-
module convention.

## Files

| File | Role |
|---|---|
| `src/services/email/email.service.js` | Provider selection (`email.provider` config: `nodemailer` or `resend`) |
| `src/services/email/email-provider.interface.js` | The interface both adapters implement |
| `src/services/email/nodemailer.adapter.js`, `resend.adapter.js` | Provider implementations |
| `src/services/email/templates/otp.template.js` | The **only** template with a real caller (`otp.service.js`) |
| `src/services/email/templates/password-reset.template.js`, `notification.template.js` | Fully implemented, **zero callers anywhere** — no password-reset confirmation email is ever sent |
| `src/services/email/README.md` | Existing doc — accurate on provider mechanics; doesn't flag that 2 of its 3 documented templates are unused |

## One fact worth repeating here

Only OTP emails (password reset request, and any OTP-based flow) actually
send. If a feature seems to promise a confirmation email on password change
or a general notification email, verify a caller exists before assuming it
fires — see GOTCHAS.md.
