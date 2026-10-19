---
doc: 06-SCREENS/unified-register
covers:
  - src/pages/unified/UnifiedRegister.jsx
read_when: "changing registration for player/coach/judge, or the post-registration redirect per role"
depends_on: [13-FORMS-AND-VALIDATION, 03-ROUTING-AND-NAV]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/unified/UnifiedRegister.jsx` (935 lines) — directly routed
(not a wrapper) at `/player/register`, `/coach/register`,
`/judge/register` (**not** admin — `AdminRegister.jsx` is a fully
separate component, see
[admin-register.md](admin-register.md)). Role detected via
`detectRoleFromPath()` (`:34-41`), defaulting to `coach`. Same
two-panel layout as [unified-login.md](unified-login.md).

## Field sets and layout

`COACH_FIELDS`/`PLAYER_FIELDS`/`JUDGE_FIELDS` tables (`:156-323`), with
shared `PHONE_RULES` (`:126-135`, 10-15 digits, mirrors the server) and
`PASSWORD_RULES` (`:148-154`, 8-char min + upper/lower/digit regex) —
see
[13-FORMS-AND-VALIDATION.md](../13-FORMS-AND-VALIDATION.md#the-net-effect-three-to-four-hand-maintained-copies-of-password-complexity-and-phone-format)
for the full duplication picture these belong to. `renderFields()`
(`:438-458`) auto-pairs consecutive `half: true` fields into two-column
rows — generic pairing logic, not per-role hardcoded layout.

**Role-specific extra fields**, rendered outside the generic table:
player gets a required `gender` select (Male/Female, `:690-727`); judge
gets an optional `certificationLevel` select (National/State/District/
Club, `:730-751`). Both share generic Password + Confirm Password
fields (`:754-855`) with a cross-field `validate: (value) => value ===
passwordValue` check via `watch('password')` (`:370`).

## Submit flow — a documented past bug in the response-unwrapping

(`:379-430`) Calls `coachAPI.register`/`judgeAPI.register`/
`playerAPI.register`, unwraps `{data:{data:{...}}}`, looks up the user
object as `payload[role] || payload.user || payload.profile`. Comment
(`:385-397`) documents the bug this fallback chain fixes: the response
returns the account under the key `user` (not `player`/`coach`), so
code that only read `response.data[role]` got `undefined`, which
**silently broke the auth context** and looked like a routing bug
rather than an unwrapping bug. The comment explicitly ties this to
`UnifiedLogin.jsx`'s identical unwrapping logic: *"same unwrapping as
UnifiedLogin, on purpose — these two must not drift."* If you change
one file's response-unwrapping, change the other's too.

## Per-role storage — an architectural asymmetry worth knowing

- **Player** additionally stores `player_token` directly (`:407-408`),
  redundant with `login()`'s own storage — comment frames this as
  belt-and-suspenders, done "before the redirect."
- **Judge** additionally stores `judge_token`/`judge_user`
  (`:413-416`) with a comment stating plainly: *"The judge pages read
  their identity from storage rather than context"* — i.e., judge pages
  bypass `AuthContext` and read `secureStorage` directly, a structural
  difference from coach/player pages. Keep this in mind if a judge
  screen behaves differently from a coach/player equivalent under the
  same auth-state change — it may not be reading the same source of
  truth.

## Post-registration destinations — a genuine three-way fork

`HOME_AFTER_REGISTER` (`:332-342`):
- **coach** → `/coach/create-team` — must create a squad before
  reaching the level chooser (see
  [coach-create-team.md](coach-create-team.md)).
- **player** → `/player/select-level` — goes straight into the
  level→competition→team flow.
- **judge** → `/judge/dashboard` (**not** `select-level`) — a
  brand-new judge has no panel seat yet, so the dashboard is the
  landing page that explains the "no seats yet" empty state (see
  [judge-dashboard.md](judge-dashboard.md#hasseats-empty-state)),
  comment at `:339-341`.

Already-authenticated redirect (`:373-377`): if `user && userType ===
role`, navigates to `HOME_AFTER_REGISTER[role]` immediately — no
pathname-loop guard here (unlike `UnifiedLogin`'s explicit check), but
unlikely to loop in practice since register and its redirect target
differ. ⚠️ UNVERIFIED whether this can actually loop under any
circumstance.

## Change guidance

- If changing how the registration response is unwrapped: apply the
  identical change to `UnifiedLogin.jsx` in the same commit — the
  comment explicitly ties the two together.
- Adding a new role's post-registration destination: add it to
  `HOME_AFTER_REGISTER`, and think through whether that role needs the
  same "no data yet, show an explanatory landing page" treatment judges
  get, rather than defaulting to `select-level`.

## Since the last pass (2026-10-18)

- Restyled in the 2026-10 "prime-time" design-language pass (shared `ui/` primitives,
  tokens, no colour literals); behaviour otherwise unchanged. Line numbers (`:NNN`)
  above predate it and are approximate — search by the named function.
