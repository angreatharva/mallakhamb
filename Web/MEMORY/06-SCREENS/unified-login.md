---
doc: 06-SCREENS/unified-login
covers:
  - src/pages/unified/UnifiedLogin.jsx
read_when: "changing login for any role, lockout/rate-limit UI, or the judge-specific login path"
depends_on: [13-FORMS-AND-VALIDATION, 03-ROUTING-AND-NAV, 10-AUTH-AND-SECURITY]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/unified/UnifiedLogin.jsx` (725 lines) — the real
implementation behind every role's `*Login.jsx` wrapper (see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md)), rendered directly at
`/{role}/login` for admin/superadmin/coach/player/judge. Role is
detected from the URL path via `detectRoleFromPath()` (`:40-55`),
defaulting to `admin` if unmatched. Two-panel layout: a left decorative
panel (desktop only) with role-specific icon/title/description from
`getRoleConfig()` (`:62-153`) — content differs per role, layout and
animation are identical by design ("unified structure, only
color/content changes"); the right panel holds the form.

## Already-authenticated redirect

(`:230-241`) If `user && userType === role && !loading`, silently
redirects — superadmin → `/superadmin/dashboard`, every other role →
`/${role}/select-level`. Guarded against redirect loops by checking
`location.pathname !== targetPath` first.

## Two independent client-side lockout/rate-limit mechanisms, layered on top of the server's own

- **`useRateLimit(5, 60000)`** (`:197`) — 5 attempts per 60s window,
  purely client-side, checked *before* every submit
  (`checkRateLimit()`, `:249`). On exceeding, shows a toast, sets
  `loginError`, and blocks the submission entirely — **the API is never
  even called** in this case.
- **Server-driven lockout**: if the API error message contains
  "locked"/"lockout" (case-insensitive substring match, `:393-401`), the
  UI manufactures its own 15-minute countdown (`lockoutEndTime = now +
  15*60*1000`) — this duration is a **hardcoded client assumption**, not
  data the server actually returns. ⚠️ UNVERIFIED whether the server's
  real lockout duration always matches 15 minutes; if it's ever changed
  server-side, this client-side countdown would silently drift from
  reality.
- A **separate** 429 rate-limit path (`:404-414`) reads
  `error.response.data.retryAfter` (seconds) when present, defaulting to
  900s otherwise.
- Both render via the same `<AccountLockoutMessage>` component (see
  [07-COMPONENTS.md](../07-COMPONENTS.md)) with a countdown; both
  disable the submit button
  (`disabled={loading || lockoutEndTime !== null || rateLimitEndTime !== null}`,
  `:663`). Both timers self-clear via a 1s-interval poll comparing
  against `new Date()` (`:172-194`) — `setInterval`, not `setTimeout`,
  so drift-tolerant but ticks once per second while active regardless
  of need.

## Submit flow branches sharply by role

Validation for both branches: `role === 'judge' ? judgeLoginSchema :
loginSchema` from `form.validator.js`, `safeParse`'d manually inside
`onSubmit`, errors mapped via `setError(err.path[0], {message})` — the
two-step "zod as a secondary submit-time check, not an RHF resolver"
pattern documented in
[13-FORMS-AND-VALIDATION.md](../13-FORMS-AND-VALIDATION.md).

- **Judge** (`:272-333`): uses `judgeAPI.login()` directly — a
  **completely separate code path** from every other role, not the
  generic `apiService.login()`. Stores `judge_user`,
  `judge_competition_id`, `judge_current_competition` in
  `secureStorage`. Confirmed MED-W6 fix still holds — logs only
  presence flags: `logger.log('Judge login response received',
  {hasToken, hasJudge, hasCompetition})` (`:285`), see
  [10-AUTH-AND-SECURITY.md](../10-AUTH-AND-SECURITY.md). Clears
  `sessionStorage.removeItem('judge_category_selected')` on success.
  **Always** navigates to `/judge/select-level` regardless of whether
  the server returned a competition — comment: multi-seat judges need
  the chooser, not an auto-picked meet.
- **Other roles** (`:335-387`): generic `apiService.login(data)`,
  unwraps `{success, data:{user, token}}`, looks up the user object via
  a role-keyed alias table (`userDataKeyByRole`: admin→'admin',
  superadmin→'admin', coach→'coach', player→'player', with `.user`/
  `.profile` fallbacks). Stores `${role}_user`. Superadmin navigates
  straight to `/superadmin/dashboard` with a **100ms `setTimeout`**
  ("so auth state commits before the guard on the next route reads
  it" — the same pattern used in
  [unified-register.md](unified-register.md)); every other role goes to
  `/${role}/select-level`.

## Dead/unreachable code

`usesEmail: true` for every role unconditionally (`:149`) — the
old-style username login for judges (panel-slot-derived usernames like
`J1-M-U14-1`) is dead in practice, but the JSX still conditionally
renders a `usesEmail === false` branch (Username label/type, `:596-625`)
that's unreachable for any current role. ⚠️ UNVERIFIED whether any role
config elsewhere ever sets `usesEmail: false` — if not, this branch can
be removed rather than maintained.

## Change guidance

- If the server's lockout duration ever changes: update the hardcoded
  15-minute client assumption at `:393-401` to match, or better, get the
  server to return the actual duration and stop hardcoding it.
- If touching the judge login path: remember it's entirely separate
  from every other role's — a fix to the generic `apiService.login()`
  branch does not automatically apply to judges.
