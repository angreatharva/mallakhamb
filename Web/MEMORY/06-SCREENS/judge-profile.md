---
doc: 06-SCREENS/judge-profile
covers:
  - src/pages/judge/JudgeProfile.jsx
read_when: "changing the judge's own account/profile screen"
depends_on: [13-FORMS-AND-VALIDATION]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/judge/JudgeProfile.jsx` (457 lines), route `/judge/profile`.
A straightforward CRUD screen — no socket usage, no panel/scoring data.
Comment at the bottom (`:443-450`) is explicit about scope: *"the panels
they sit on are shown on the dashboard instead — that is the first
thing a judge needs on opening the app, and it is not something they
can change from here in any case."*

## Two independent forms

Both via separate `react-hook-form` instances (no shared form state):
- **Account details** — name, email, phone, stateUnit, MFI registration
  number, certification level dropdown — saved via
  `judgeAPI.updateProfile`.
- **Password change** — current/new/confirm — via
  `judgeAPI.changePassword`. Client-side validation: min 8 chars +
  uppercase + lowercase + digit regex (`:404-409`); confirm-match
  validated against `watchPassword('newPassword')`.

## Photo upload — client-side downscale, and why

`downscaleImage(file, 256)` (`:36-54`) does a client-side canvas
downscale to a 256px JPEG data URL before sending. Comment explains
photos are stored **inline on the account document** — no object
storage in this project, and the deployment disk is ephemeral — so the
client must keep the image small to avoid the API body size limit.

## Non-obvious behavior

On successful profile save, the stored `judge_user` in `secureStorage`
is patched with the new `name`/`email` (`:148-162`) — "so a rename has
to land there too or the dashboard keeps greeting the old name." If
you add a new editable field here that other screens read off
`judge_user`, patch it into storage the same way on save.

## Change guidance

- If adding a new photo/file upload elsewhere in the app: check whether
  it needs the same client-side downscale — the inline-storage
  constraint (no object storage, ephemeral disk) applies wherever
  photos are stored on a document rather than externally.
