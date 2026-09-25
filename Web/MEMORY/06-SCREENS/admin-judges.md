---
doc: 06-SCREENS/admin-judges
covers:
  - src/pages/admin/AdminJudges.jsx
read_when: "changing judge panel staffing/assignment UI"
depends_on: [08-API-INTEGRATION, SHARED-CONTRACTS, 03-ROUTING-AND-NAV]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminJudges.jsx` — 1037 lines, ~52KB. Not a top-level
route: rendered as the `dashboard/judges` tab inside
`UnifiedDashboard.jsx`'s `switch(activeTab)` (see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md#where-the-15kb-screens-actually-live--not-all-of-them-are-routes)),
for both `/admin/dashboard/judges` and `/superadmin/dashboard/judges`.
Lets an admin/superadmin staff and edit the judge panel for one
category (gender → age group → competition type → apparatus), and
search/assign already-self-registered judge accounts to panel seats.

## Role dispatch

Shared pattern across every admin/superadmin screen: `const {
routePrefix } = useRouteContext(); const api = routePrefix ===
'/superadmin' ? superAdminAPI : adminAPI; const isSuperAdmin =
routePrefix === '/superadmin';`. Superadmin must additionally pick a
`selectedCompetition` from a `Dropdown` (fetched via
`superAdminAPI.getAllCompetitions()`) before any category filter
unlocks; admin gets its competition for free from
`useCompetition().currentCompetition`.

## Data fetching and state

No custom hook — plain `useEffect` cascades. Competitions loaded once
for superadmin (`:427`). Judge list via `api.getJudges(buildJudgeQueryParams())`
(`:570`) plus `api.getAllJudgesSummary()` to check `isStarted` per
category (`:575`). Judge search (`JudgeSearch` subcomponent, `:142`) is
debounced 300ms, hits `api.searchJudgeAccounts(query)` on ≥2 chars.

A five-rung "ladder" gates progressively — Judge Action → Gender → Age
Group → Competition Type → Apparatus — each change resets everything
below it (`:442-477`). Large flat `useState` set, no reducer/context.

## Form pattern

No `react-hook-form`/zod — manual controlled `Dropdown`s plus the
bespoke `JudgeSearch` autocomplete. "Add Judge" mode uses
`judgeFormData` (array of 6 slots seeded from `EMPTY_JUDGE_FORM`);
"Judge List" mode edits existing seats via an `AssignJudgeModal`.

## Non-obvious behaviors

- **Judges are never created here** — only assigned. Admins search
  already-self-registered judge accounts to seats; if a search returns
  nothing, `registerUrl()` (`:243-253`) copies the `/judge/register`
  link to clipboard so the admin can send it to someone.
- **Apparatus is the last rung, and the one that actually triggers the
  panel lookup** (`:604`, `handleApparatusChange`). Competition Type
  only narrows apparatus options and does not itself fetch — comment
  (`:590-601`) explains why: post-migration-010, category-wide panels
  no longer exist, so looking up at the competition-type rung would ask
  for something that isn't there (see
  [Panel Apparatus Scope](../../../Server/MEMORY/GOTCHAS.md) on the server
  side for the migration this refers to).
- **Duplicate-seat prevention is done client-side twice**: once via a
  `taken` map passed to `JudgeSearch` in the Add form (a slot can't pick
  someone already in another slot of the same form or already seated on
  the panel, `:900-917`), once at `handleSaveJudges` before POST
  (`:643-655`). Server also enforces it — this is UX-only
  pre-validation, don't treat either client check as the actual
  guarantee.
- **`ageGroupStarted`** (from `getAllJudgesSummary`) disables Edit/Delete/
  Unlock once a category has begun (`:690, 697, 1006, 1010`) — an admin
  cannot restaff a panel mid-competition.
- **`padJudgeSlots`** (`:491`) always renders exactly 6 slots (Senior
  Judge, Judge 1-4, Scorer) regardless of how many the server returns,
  and stamps the *currently selected* apparatus onto empty slots rather
  than reading it off state — deliberately, to avoid a race where
  `selectedApparatus` hasn't updated yet in the same tick the list
  reloads (`:479-489`).

## Change guidance

- If you're changing how many panel seats can exist or their role
  names: `padJudgeSlots`'s hardcoded 6-slot assumption (Senior Judge +
  Judge 1-4 + Scorer) needs to change in lockstep — see
  [11-SCORING-CLIENT.md](../11-SCORING-CLIENT.md) for `PANEL_TYPES` and
  how panel size is derived elsewhere.
- Don't add a competition-type-level panel fetch — apparatus is
  deliberately the only rung that fetches, per the migration-010 reason
  above.
