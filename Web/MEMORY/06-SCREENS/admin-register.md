---
doc: 06-SCREENS/admin-register
covers:
  - src/pages/admin/AdminRegister.jsx
read_when: "changing admin self-registration"
depends_on: [13-FORMS-AND-VALIDATION, 10-AUTH-AND-SECURITY]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminRegister.jsx` — 516 lines, ~23KB. A real
top-level route at `/admin/register`, outside `AdminLayout`/
`ProtectedRoute` (as expected for a public registration page). **Not**
a `UnifiedRegister` wrapper — admin registration is its own separate
component and flow (see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md#§34-resolved-unifiedloginunifieddashboard-are-the-real-implementations)).

## Form

Plain `useForm()` from react-hook-form, **no zod/yup resolver**
(`:128`) — consistent with the codebase-wide pattern documented in
[13-FORMS-AND-VALIDATION.md](../13-FORMS-AND-VALIDATION.md). Validation
is entirely inline `register()` rules (`required`, `minLength`,
`pattern`, `validate`) plus manual `setError()` calls in `onSubmit` for
password-length/match (`:134-145`) — the manual length check duplicates
what the `minLength: 12` rule on the password field already declares.

Fields: Full Name, Email, Password, Confirm Password. Password has a
live strength meter (`PasswordStrengthIndicator`, 5-level scale based
on length/case-mix/digit/symbol, `:32-79`) and a requirements checklist
(`PasswordRequirements`, 4 checks, `:84-112`) — **both purely
cosmetic/advisory**; the actual gating rule is just `minLength: 12`.

## Flow

`onSubmit` → `adminAPI.register({name, email, password})` → stores
`admin_token`/`admin_user` via `secureStorage` → calls `login(admin,
token, 'admin')` from `AuthContext` → success toast → **flips local
state to render `CompetitionSelectionScreen` inline**
(`showCompetitionSelection`, `:126, 191-198`) instead of navigating —
the whole component conditionally swaps its entire render tree
post-registration rather than using the router.

## Non-obvious behaviors

- **Fragile duplicate-email detection**: checks
  `error.response?.data?.message?.includes('email already exists')` OR
  `.includes('Email already registered')` OR `.includes('duplicate')`
  (`:178-182`) — three different substring checks for what is
  presumably one server error, suggesting the backend message text has
  drifted over time or varies by code path (Mongo duplicate-key vs.
  explicit check). If the server error message ever changes again,
  this three-way check is the thing that will silently stop matching.
- **Rate-limit message is a hardcoded magic number**: `error.response
  ?.status === 429` → "Please wait 15 minutes and try again" (`:177`) —
  the 15-minute figure is baked into the UI string, not read from a
  server-supplied retry-after value.
- **Self-contained theming**: wraps itself in its own `<ThemeProvider
  role="admin">` (`:508-514`) independently of whatever provider wraps
  the route tree — same pattern as `AdminDashboard.jsx`.

## Change guidance

- If the server's duplicate-email error message changes: update all
  three substring checks at `:178-182`, or better, switch to matching
  on an error **code** instead of message text if the server exposes
  one.
- If adding a real 429 retry-after value from the server: replace the
  hardcoded "15 minutes" string at `:177` rather than adding a second
  parallel message.
