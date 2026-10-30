---
doc: 06-SCREENS/judge-dashboard
covers:
  - src/pages/judge/JudgeDashboard.jsx
  - src/pages/judge/judgeCategoryOptions.js
read_when: "changing the judge landing screen, the category picker, or multi-meet switching"
depends_on: [SHARED-CONTRACTS, 09-REALTIME, 08-API-INTEGRATION]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is

`src/pages/judge/JudgeDashboard.jsx` (1204 lines), route
`/judge/dashboard`. Judge's name/seat header; a 5-rung category-ladder
picker modal (meet → Gender → Age Group → Competition Type →
Apparatus), auto-opened on first visit for a seated judge (`:165-174`);
once confirmed, a "Current Assignment" summary strip, a searchable team
list (filtered/sorted by live running order), a "Set Sequence" button
(Senior Judge/Scorer seats only, linking to `/judge/sequence`), a
"Change Category" button, and Profile/Logout. The meet list shows each meet's
place and level (`levelLabel`, `utils/competition/levels.js` — six levels incl.
DSO and University).

## Scorer + Time Keeper — the role popup (2026-09-27)

The Scorer and Time Keeper are the **one pair of seats one person may hold
together**. When the chosen category seats this person as both
(`holdsBothRecorderSeats(seatTypesFor(judgeInfo, category))`,
`RECORDER_ROLES = ['Scorer', 'Time Keeper']`), a popup of its own asks which
role to work as, right after the category is confirmed. The answer is kept in
`sessionStorage['judge_selected_role']` so a refresh doesn't ask again, and is
**cleared whenever the category changes** (a new category asks again). Until it
is answered the team list waits behind the popup; the strip then shows the
chosen role (Timer icon for the Time Keeper).

Opening a team: the **Time Keeper** goes straight to `/judge/scoring` with the
team and `isTimeKeeper: true` (like the Scorer, who gets `isScorer: true`);
for a both-seat person the popup's choice decides which flag is set. The
dispatcher in `JudgeScoring.jsx` reads those flags — see
[judge-scoring.md](judge-scoring.md) and
[time-keeper-scoring.md](time-keeper-scoring.md).

## Multi-meet switching — a genuinely significant, safety-relevant flow

A judge can be seated at multiple competitions. `selectCompetition`
(`:293-363`) re-issues a **competition-scoped auth token** via
`judgeAPI.setCompetition(nextId)` — because `x-competition-id` is
derived server-side from the token claim, not client state — rewrites
the stored `judge_user`, and **clears every downstream sessionStorage
selection** so a stale category from the old meet can't survive into
the new one. Comment (`:338-347`) is explicit this must be persisted at
**switch-time, not confirm-time** — a reload mid-flow could otherwise
show a category from a meet the token is no longer scoped to. This is
the one place `login(nextJudge, token, 'judge')` gets called outside
the actual login flow — it re-authenticates the session in place.

## Assignments are fetched live, not from the login session

`judgeAPI.getAssignments()` (`:149-163`), not the stored login session
— comment explains the stored session only reflects assignments as of
login, so a judge seated mid-event by an organiser wouldn't see the new
panel without a live fetch.

## Apparatus resolution priority

(`availableApparatus`) Seat's own named apparatus (legacy) > what the meet
runs **for this gender** in this type (`offeredApparatus(activeCompetition,
type, gender)` from `utils/scoring/apparatus.js`, which reads
`apparatusByGender` and falls back to the per-type `apparatusConfig` for a
meet saved before the split) > what registered athletes of this gender and age
group actually hold. Explicit
past-bug note: `judgeInfo.competition` is stored as a bare id string,
so an old lookup `judgeInfo.competition?.apparatusConfig?.[type]` was
always `undefined` — `activeCompetition` (the full stored competition
document) is read separately specifically to fix this.

## Ladder auto-answer effect

(`:373-412`) Clears any rung's selection that's no longer valid given
the rungs above it, and auto-fills any rung with exactly one possible
answer — replacing a prior one-shot, non-reactive auto-selection that
"could not react to a gender change, which is how Under 16 stayed
selected for a Male category" (`:369-371`).

## `hasSeats` empty state

(`:644-645, 772-790`) A judge with zero panel assignments (registered
but not yet staffed) sees an explanatory empty state rather than the
picker modal — comment (`:130-135`) notes a past bug where suppressing
a mounted `AnimatePresence` modal only starts its exit animation,
leaving an invisible-but-still-click-swallowing full-screen overlay
(verified in-browser at the time).

## Socket usage

Own connection (URL `apiConfig.getSocketUrl()`) purely for live running-order re-sort —
joins `scoring_${gender}_${ageGroup}_${competitionType}`, listens for
`performance_order_updated`, applies directly via
`indexPerformanceOrder` rather than refetching. See
[09-REALTIME.md](../09-REALTIME.md).

## `judgeCategoryOptions.js` — the category-picker's pure logic (239 lines)

Not a route; consumed only by this screen. Its own header (`:1-25`)
documents it as "the client half of
`Server/src/utils/data/judge-assignment.util.js`
(`assignmentCoversCategory`)" — applies the same three seat-coverage
rules the server uses, specifically to keep the picker from offering a
category the server would reject a slip for.

Exports: `COMPETITION_TYPES`, `GENDERS`, `idOf` (handles populated-doc
vs. bare-id ambiguity), `seatCoversCategory` (the core coverage
predicate, every field optional), `seatsForCategory`,
`competitionsForJudge`, `gendersForJudge`, `ageGroupsForJudge`
(gender-aware bracket ordering, legacy out-of-bracket seats appended
rather than hidden, `:141-144`), `competitionTypesForJudge`,
`apparatusOptionsForJudge` (the same three-tier authority documented
above).

**A subtle coverage rule worth knowing** (`:218-234`):
`apparatusOptionsForJudge` only narrows to seat-named apparatus when
**every** covering seat names one — a single category-wide
(`apparatus: null`) seat among several apparatus-specific ones causes
**all** apparatus to be offered, because the server's
`assignmentCoversCategory` treats that one seat as covering everything.
If a judge's apparatus picker is offering more than expected, check for
a mixed legacy/specific seat set before assuming it's a bug.

## Non-obvious behaviors

- The category picker fetches teams **while the picker is open**
  (`:465-475`) — a past bug gated the teams fetch on the picker being
  *closed*, which made the apparatus rung (derived partly from
  registered-athlete data) permanently unreachable on a fresh session.
- `canSequence = SEQUENCE_JUDGE_TYPES.includes(myJudgeType)` where
  `SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer']` (`:39`) is a
  **client-side copy** of the server's own constant — only decides
  whether to show the button; the server independently enforces it.
  The same constant is duplicated verbatim in
  [judge-sequence.md](judge-sequence.md), with its own comment
  acknowledging the duplication.
- Empty apparatus selection is treated as "judge whatever's
  registered," never defaulted to Pole — this is where that default
  used to live (`:104-115`), the same fix documented for
  [judge-team-players.md](judge-team-players.md).

## Change guidance

- If a judge reports missing panels: check `getAssignments()` is
  actually being called live, not read from a cached login session.
- Never default `selectedApparatus` to Pole when empty — treat empty as
  "whatever the athlete is registered for," per the two documented past
  bugs this caused.

## Since the last pass (2026-10-21, `ff89ca5`)

- The header carries `AccountMenu` (My profile / Change password / Update
  email → `/judge/profile`). Only here — not on the scoring screens, so
  nothing new can take a judge off a slip. See [account-and-player-identity.md](account-and-player-identity.md).

## Since the last pass (2026-10-30, against `4201319`)

- A Competition II/III category lists the **finalists themselves** in running
  order (`data-testid="judge-finalists"`), each with a small team tag (plus
  their age group in the All-ages final); search covers players and teams.
- Age group labels come from `ageGroupMapping` ("Under 10", "All ages"); entry
  filters use `ageMatches`.
