---
doc: 13-FORMS-AND-VALIDATION
covers:
  - src/validators/form.validator.js
  - src/pages/unified/UnifiedLogin.jsx
  - src/pages/unified/UnifiedRegister.jsx
  - src/pages/coach/CoachCreateTeam.jsx
  - src/components/superadmin/AddPlayerForm.jsx
read_when: "adding a form, changing password/phone/name validation rules, or wondering why two forms validate the same field differently"
depends_on: [07-COMPONENTS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## The headline finding: `zodResolver` is never used, anywhere

Despite `zod` schemas existing in `src/validators/form.validator.js`
(the only file in `src/validators/**` — confirmed, no siblings), **no
form in the codebase wires them in via react-hook-form's `resolver`
option** — `grep -r zodResolver Web/src` returns zero matches. Every
form uses RHF's native inline validation
(`register(name, {required, pattern, minLength, validate})`) instead.

Only two files even import from `form.validator.js`, and neither uses it
as a resolver:
- **`UnifiedLogin.jsx`** imports `loginSchema`/`judgeLoginSchema` but
  calls `schema.safeParse(data)` **manually inside `onSubmit`** (not via
  RHF), then loops `validation.error.errors` and calls RHF's
  `setError(path, {message})` per field — the zod schema is a secondary
  submit-time check layered on top of a `useForm()` that otherwise has
  no field-level RHF rules for login at all.
- **`ForgotPassword.jsx`** imports only the plain helper
  `validateEmailFormat`, used inside an RHF `validate` rule:
  `register('email', {validate: v => validateEmailFormat(v) || '...'})`.
  (See [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) for the
  related finding that `ResetPassword.jsx` — the sibling screen — uses
  its own separate inline regex instead of this same helper.)

Every other schema in the file
(`playerRegisterSchema`, `coachRegisterSchema`, `resetPasswordSchema`,
`forgotPasswordSchema`, `nameSchema`, `phoneSchema`, `passwordSchema`,
`validatePasswordStrength`, `validatePhoneFormat`, `validateData`)
has **no confirmed caller** among the form components surveyed. Treat
`form.validator.js` as a partially-adopted, mostly-dead validation
layer, not the actual source of truth for what a given form accepts —
check the form component itself.

## `form.validator.js` — full contents (154 lines)

**Plain-JS helpers** (not zod, used independently):
- `validateEmailFormat(email)` — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, trims.
- `validatePasswordStrength(password)` → `{isValid, errors[]}` — 8-128
  chars, needs one lowercase + one uppercase + one digit. **No
  special-character requirement.**
- `validatePhoneFormat(phone)` — strips whitespace, requires exactly
  `/^[0-9]{10}$/` (10 digits, no country code, no separators).

**Zod field schemas**: `emailSchema` (min 1, `.email()`, max 255),
`passwordSchema` (min 8/max 128 only — complexity is NOT enforced at
the zod level, only via the separate `validatePasswordStrength` helper
that nothing in the schemas calls), `nameSchema` (min 1/max 100,
`/^[a-zA-Z\s'-]+$/`), `phoneSchema` (`/^[0-9]{10}$/` — stricter than
`validatePhoneFormat`, no whitespace stripping here).

**Zod form schemas**: `loginSchema` `{email, password}`;
`judgeLoginSchema` — identical shape, kept as a named alias because
judges used to log in with a server-generated username
(e.g. `J1-M-U14-1`, derived from panel slot) before unifying on email
like every other role; `playerRegisterSchema`
`{firstName, lastName, email, phone, password, confirmPassword,
dateOfBirth, gender}` + a `.refine()` cross-check that
`password === confirmPassword` (error path `['confirmPassword']`);
`coachRegisterSchema` — same minus `dateOfBirth`/`gender`, no team/org
field; `forgotPasswordSchema` `{email}`; `resetPasswordSchema`
`{password, confirmPassword}` + the same password-match refine.
`validateData(schema, data)` — generic runner: `schema.safeParse`,
flattens `result.error.errors` into a `{path: message}` object.

**A real gap for a sports competition app**: `playerRegisterSchema`'s
`dateOfBirth` is `min(1, 'required')` only — no date-format check, no
age-range validation, no birth-date-in-past check, no age-group
cross-check. Age-group eligibility logic exists in this codebase, but
lives entirely in `AddPlayerForm.jsx` (below), not here.

## Every form hand-rolls its own rules — four representative examples

1. **`UnifiedLogin.jsx`** (shared by admin/superadmin/coach/player/judge,
   role read from the route path). `useForm()` with no resolver; inline
   `register('email', {required, pattern})`/`register('password',
   {required})` for display, but the actual validation gate is the
   manual `loginSchema.safeParse()` + `setError()` step described above.
   Errors render via `errors[field].message` in an
   `AnimatePresence`-wrapped `<motion.p role="alert">`. Lockout/rate-limit
   banners are separate local state, not RHF errors.

2. **`UnifiedRegister.jsx`** (coach/player/judge). **Does not use any
   schema from `form.validator.js`** — defines its own inline field-rule
   tables (`COACH_FIELDS`, `PLAYER_FIELDS`, `JUDGE_FIELDS`) plus two
   shared rule objects: `PHONE_RULES` (10–15 digit range, explicitly
   documented in-file as mirroring the **server's** validator, not the
   frontend zod one) and `PASSWORD_RULES` (min 8 + a hand-written regex
   requiring lower/upper/digit — duplicating `validatePasswordStrength`'s
   logic by hand rather than calling it). A comment notes `PASSWORD_RULES`
   was fixed to match the server after a real bug: the form used to
   accept 6-char passwords that the API then rejected.

3. **`CoachCreateTeam.jsx`**. Simple `useForm()`, two fields (`name`
   required, `description` optional) — team name/description aren't
   modeled in `form.validator.js` at all. Errors: plain
   `<p role="alert">{errors.name.message}</p>`.

4. **`AddPlayerForm.jsx`** (superadmin, see
   [07-COMPONENTS.md](07-COMPONENTS.md#superadminaddplayerformjsx-820-lines)).
   `useForm()` with its own inline rules, including its own **independent
   password rule** — `required`, `minLength: 8` only, no complexity
   regex — actually weaker than both `form.validator.js`'s
   `validatePasswordStrength` and `UnifiedRegister.jsx`'s
   `PASSWORD_RULES`. Non-RHF-managed fields (gender, age group, team,
   competition, apparatus — all custom `Dropdown`s on local `useState`,
   not `register()`) are validated **imperatively inside `onSubmit`** via
   a chain of manual `if` checks calling either `setError()` (RHF) or
   `toast.error()` (non-field errors) — a second, inconsistent
   error-reporting channel within the same form. This file also contains
   the app's real age-group eligibility logic: `ageGroupLimits` maps
   `Under10/12/14/16/18` → `maxAge`, `Above16/18` → `minAge`;
   `calculateAge(dob)` computes age from DOB; `getAvailableAgeGroups()`
   filters eligible groups; `onSubmit` re-validates the selected age
   group against DOB before allowing checkout. **Not reused anywhere
   else** — self-contained in this one component.

Two more files use plain `useForm()` with no resolver (grep-confirmed,
not read in full): `pages/admin/AdminRegister.jsx` and
`pages/judge/JudgeProfile.jsx` (two separate `useForm()` calls).

## The net effect: three to four hand-maintained copies of "password complexity" and "phone format"

| Rule | Copy 1 | Copy 2 | Copy 3 |
|---|---|---|---|
| Password complexity | `form.validator.js`'s `validatePasswordStrength` (8-128, lower+upper+digit) — unused by any form | `UnifiedRegister.jsx`'s `PASSWORD_RULES` (same shape, hand-rewritten) | `AddPlayerForm.jsx`'s inline rule (weaker: length-only, no complexity check) |
| Phone format | `form.validator.js`'s `phoneSchema`/`validatePhoneFormat` (exactly 10 digits) | `UnifiedRegister.jsx`'s `PHONE_RULES` (10–15 digits, documented as mirroring the **server's** validator instead) | — |

None of these disagree by accident-you'd-notice-immediately margins, but
they are three to four independently-edited copies with no shared
constant and no test tying them together — the opposite of the
sync-tested pattern documented for scoring/fee/lock math in
[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md). If you're asked to change a
password or phone rule, grep for all of the above before assuming one
edit covers the app.

## Testing note

No shared `render`-with-providers test utility exists — see
[14-TESTING.md](14-TESTING.md) for the full test-suite survey; every
`.test.jsx` file wraps `MemoryRouter`/`AuthContext.Provider` etc.
manually and inline rather than through a shared helper.

## Change guidance

- Before adding password/phone/name validation to a new form: search
  `form.validator.js`, `UnifiedRegister.jsx`'s `PASSWORD_RULES`/
  `PHONE_RULES`, and `AddPlayerForm.jsx`'s inline rules first — decide
  deliberately which copy (if any) to align with, since there's no
  canonical one currently enforced.
- If you're asked to actually fix the duplication (not just add a
  form): the natural target is wiring `zodResolver` + the existing zod
  schemas into RHF for the forms that already loosely match them
  (login, forgot/reset password), and deciding one true phone/password
  rule for registration forms — this hasn't been done and isn't a small
  change (`UnifiedRegister.jsx`'s `PHONE_RULES` deliberately mirrors the
  *server's* rule, which is wider than the zod `phoneSchema`'s, so
  reconciling them means picking a winner, not just wiring the resolver).
- Age-group eligibility (DOB → allowed age groups) logic lives only in
  `AddPlayerForm.jsx` — if another screen needs the same check
  (`CoachCreateTeam`-adjacent flows, `UnifiedRegister`'s player path),
  it does not exist yet as a shared utility.
