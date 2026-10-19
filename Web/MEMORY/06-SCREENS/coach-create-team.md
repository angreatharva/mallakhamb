---
doc: 06-SCREENS/coach-create-team
covers:
  - src/pages/coach/CoachCreateTeam.jsx
read_when: "changing the team-creation screen or its post-submit routing"
depends_on: [13-FORMS-AND-VALIDATION]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/coach/CoachCreateTeam.jsx` (~220 lines), route
`/coach/create-team` (`CoachLayout`). The form itself (name +
description, plain `useForm()`, no zod resolver) is documented in
[13-FORMS-AND-VALIDATION.md](../13-FORMS-AND-VALIDATION.md#every-form-hand-rolls-its-own-rules--four-representative-examples) —
this doc covers what the screen does around that form.

## Flow

- **On mount, checks whether the coach already has a team** via
  `coachAPI.getStatus()` (`:19-53`). If `hasTeam && step ===
  'select-competition'`, it **redirects away before the form ever
  renders** (`navigate('/coach/select-level', {replace: true})`, `:38`)
  — a coach can never re-create a team through this screen once one
  exists; they're routed into the level→competition flow instead.
  Shows a "Checking your status..." spinner during this check.
- **On successful submit** (`:55`): calls `coachAPI.createTeam(data)`,
  toasts success, then **waits 500ms** before navigating to
  `/coach/select-level` with `state: {teamCreated: true}` — comment
  (`:60-63`) frames the delay as "to ensure the team is available in
  the backend," a read-after-write race workaround. ⚠️ UNVERIFIED
  whether `select-level` actually reads the `teamCreated` state flag for
  anything.
- Renders a 3-step visual progress indicator (Register → Create Team →
  Select Competition, `:100-119`) — purely decorative, no routing logic
  keyed off it.

## Change guidance

- If team creation ever fails intermittently right after submit,
  suspect the 500ms fixed-delay read-after-write workaround before
  assuming a new bug — it's a known, deliberate (if fragile) pattern.

## Since the last pass (2026-10-18)

- Restyled onto the shared `Field` / `Heading` primitives (2026-10-10).
- Team size is **not** chosen here: it was briefly a coach field
  (2026-09-25) and moved to the superadmin's competition form the next day
  (`Competition.maxTeamSize`, per meet). Don't reintroduce it on this screen.
