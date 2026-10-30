---
doc: 06-SCREENS/admin-finals
covers:
  - src/pages/admin/AdminFinals.jsx
  - src/components/finals/**
  - src/hooks/useAgeGroups.js
read_when: "changing the Finals tab, the coach/player qualifier cards, the public Finals view, or anything that handles the All-ages category"
depends_on: [SHARED-CONTRACTS, 06-SCREENS/unified-dashboard, 06-SCREENS/judge-dashboard]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is (2026-10-30, `f8df5b9` + `4201319`)

Automatic finals (owner rules: `docs/qualification-plan.md`; server:
`Server/MEMORY/modules/scoring.md` "Automatic finals"). Competition II = one
**All ages** final per gender (top 2 of each age group by the sum over every
apparatus); Competition III = top 10 per gender × age group × apparatus, at
most 2 per team.

**Finals tab** (`pages/admin/AdminFinals.jsx`, in `UnifiedDashboard` for admin
and super admin; `isSuperAdmin` switches the API to `/superadmin/finals` with
`competitionId`, and the super admin gets a meet picker on the tab itself via
the `meetPicker` prop):

- Per final a card: status (`waiting` "Waiting for Competition I",
  `waiting_draw` "Tie: draw needed", `set` "Ready to finalize", `finalized`,
  `started`), qualifiers player-first with a team tag, passed-over players,
  Withdraw / Reinstate, the II tie draw.
- **Finalize gate:** nobody is entered for judges, lots, coaches, players or
  the public until a final is finalized. "Finalize all ready finals" opens a
  summary (`FinalizeSummary`, `data-testid="finalize-summary"`) of every
  finalist, everyone passed over and the finals not ready with their
  `blockers`; each ready card also has its own Finalize. **Reopen** shows for
  the super admin only (server refuses once the final has a score).
- API: `services/user/admin.api.js` `finals.{list,recompute,withdraw,reinstate,draw,finalize,finalizeAll,reopen}`.

**Elsewhere:** `components/finals/QualifiedFinals.jsx` on the coach and player
dashboards (finalized finals only); the public results page's Finals view;
the judge dashboard lists finalists player-first (see judge-dashboard doc).
Coaches enter Competition I only now (`AddPlayerForm`/coach dashboard).

## All ages (`hooks/useAgeGroups.js`)

`ALL_AGES = 'AllAges'` (label "All ages") is a CATEGORY, never a player's age
group: `ALL_AGE_GROUPS` excludes it; `withAllAges`, `typesForAgeGroup`,
`runsAllAges` add it to pickers (Judges, Lots, Scores); entry filters must use
`ageMatches(entryAge, categoryAge)` — a plain `===` drops every finalist.
Mirrors Server `utils/data/category.util`.
