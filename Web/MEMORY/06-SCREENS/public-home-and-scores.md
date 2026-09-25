---
doc: 06-SCREENS/public-home-and-scores
covers:
  - src/pages/public/Home.jsx
  - src/pages/public/PublicScores.jsx
read_when: "changing the public landing page or the public results viewer"
depends_on: [07-COMPONENTS, 05-DESIGN-SYSTEM]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## `Home.jsx` — the public landing page (839 lines, ~44KB)

Route `/`, no auth, no layout wrapper. Composition:
`MagneticCursor` (desktop cursor-follow effect) → `Navbar` →
`<main>` (`HeroSection`, `StatsBar`, `AboutSection`, `LegacyTimeline`,
`QuoteStrip`, `FeaturesSection`) → `Footer`. Entirely presentational —
**no data fetching anywhere in this file** (no API calls of any kind);
all content is static/hardcoded.

**A real dead-link finding worth flagging**: the nav includes links to
`/about`, `/gallery`, `/contact` (`:256-261`) — **none of these routes
exist** in `routes/index.jsx` (only `/`, `/scores`, the auth routes, and
the catch-all `NotFound`). Clicking any of the three hits `NotFound`.
⚠️ UNVERIFIED whether these pages are simply not built yet or this is a
genuine stale-link bug — either way, it's user-facing on the primary
landing page and worth surfacing if you're asked to audit dead links.

**Role entry points**: a local `roles` array (`:46-51`) drives the hero
section's role cards — Player, Team Coach, and Judge each get both a
`loginTo` and `registerTo` link; Admin gets `loginTo: '/admin/login'`
only, `registerTo: null` (no self-registration card — consistent with
`AdminRegister` being a separate flow, see
[admin-register.md](admin-register.md)). No card for superadmin at all
(not self-service, as expected).

**Reduced-motion handling**: `ParticleField` and `GridLines` both
early-return `null` under `useReducedMotion()` (`:56, :88`) —
consistent with the reduced-motion patterns documented elsewhere in
[05-DESIGN-SYSTEM.md](../05-DESIGN-SYSTEM.md).

## `PublicScores.jsx` — the public results viewer (362 lines)

Route `/scores`, no auth. A cascading 5-filter UI (Competition → Gender
→ Age Group → Competition Type → Apparatus), each selection resetting
everything below it via 4 chained `useEffect`s (`:58-86`). **Only the
final selection (apparatus) triggers the score fetch** (`:91-97`) — all
5 filters must be set before any API call fires. Comment confirms:
"Apparatus is the last selection, so it is the one that triggers the
read" — the same "apparatus is deliberately last" pattern documented for
[admin-scores.md](admin-scores.md)'s and
[admin-judges.md](admin-judges.md)'s filter ladders.

**Data fetching**: `publicAPI.getCompetitions()` on mount populates the
competition dropdown, with `competitionTypes`/`apparatusConfig`
embedded per competition used to derive the cascading options
client-side (`getAvailableCompetitionTypes()`/`getAvailableApparatus()`,
`:42-55`) — no further API calls needed for those two levels.
`publicAPI.getScores({competitionId, gender, ageGroup, competitionType,
apparatus})` (`:125-152`) fires only once all 5 are set.

**This screen is a thin filter-and-fetch shell, not a ranking/formatting
authority**: converts raw scores through `rowsFromPublicScores(scores)`
then `filterRows(rows, searchTerm)` (see
[07-COMPONENTS.md](../07-COMPONENTS.md#scores)), then renders via
`<PlayerRankingBoard players={filteredPlayers} />` — reusing `SkeletonRow`
from that same module for the loading state (4 skeleton rows).

**A known, defensively-handled data gap**: the `ageGroups` field on each
competition option is noted in-code as "Absent from the public payload
today, so the age-group filter falls back to the gender's full list"
(`:109-112`) — the public competitions endpoint doesn't currently return
`ageGroups`, so the filter can't narrow by what the competition actually
runs (only by gender-validity). Written defensively "so that it narrows
on its own if the endpoint ever starts sending it" — a client-side gap
tracking a server-side incompleteness, not something the UI itself can
fix.

**Three distinct empty/loading states**: pre-filter ("Select Filters to
View Scores"), post-filter-but-no-scores ("No Scores Available...
Scores will appear here after judges complete their scoring"), and a
search-yields-nothing sub-state within results ("No players found for
'{term}'" with a "Clear search" button).

## Change guidance

- If the public competitions endpoint ever starts returning
  `ageGroups`: no client change should be needed — `PublicScores.jsx`
  is already written to use it once present (`:109-112`).
- If asked to fix the dead `/about`/`/gallery`/`/contact` links on
  `Home.jsx`: confirm with the user whether the intent is to build those
  pages or remove the links — this doc doesn't resolve that ambiguity.
