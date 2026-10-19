---
doc: 06-SCREENS/judge-panel-data-hook
covers:
  - src/pages/judge/useJudgePanelData.js
read_when: "changing how JudgeScoring/JudgePanelReview fetch or receive live panel data"
depends_on: [SHARED-CONTRACTS, 09-REALTIME, 06-SCREENS/judge-scoring, 06-SCREENS/judge-panel-review]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/judge/useJudgePanelData.js` (607 lines) — not a route; shared
by [judge-scoring.md](judge-scoring.md) and
[judge-panel-review.md](judge-panel-review.md) (and `seatTypesFor` by the
dashboard and the Time Keeper screen). The data/socket layer both scoring
screens sit on top of.

## Exports

- **`slipToBreakdown(slip)`** (`:45-54`) — converts a server-stored
  flat-totals judgeSlip (`difficultyScore`/`combinationScore`/
  `executionScore`/`bonusScore`) into the nested breakdown shape with
  `detailed: false`, since element counts/checklist items aren't
  persisted per judge.
- **`useJudgeSession(locationState)`** (`:64-145`) — resolves the
  active scoring session from router state, falling back to
  `sessionStorage[ACTIVE_SESSION_KEY]`. **Holds the previous object
  reference** when the new incoming session describes the same
  `(player, team, competitionType, apparatus)` tuple (`:93-100`) —
  specifically to avoid rebuilding `selectedPlayer`/`selectedTeam`
  identity and refiring downstream effects on every route hop between
  Scoring and Panel Review. Also resolves `selectedApparatus` via
  `apparatusToJudge(...)` — comment documents a real past bug: without
  consulting the athlete's own registration, competitions with no
  `apparatusConfig` always fell back to `'Pole Mallakhamb'`, so Rope
  athletes were judged on the Pole checklist.
- **`resolveJudgeSeat(judgeInfo, category)`** (`:164-183`) — finds
  which seat matches `{gender, ageGroup, competitionType, apparatus}`;
  falls back to the account's primary seat. **This is UI-only trust,
  explicitly documented as such** — it mirrors server-side resolution
  in the admin controller's `saveScores`, "the server ... ignores
  whatever the client asserts," so this exists purely to keep the UI
  honest, never as an authorization mechanism.
- **`seatTypesFor(judgeInfo, category)`** — **every** seat type this person
  holds that covers the category (deduped). `resolveJudgeSeat` returns one
  seat; this is what tells a Scorer who is also the Time Keeper apart — used by
  `JudgeDashboard` (the role popup) and `TimeKeeperScoring` (its route guard).
- **`judgeRoleFor(judgeInfo, category)`** — thin wrapper returning just
  `.judgeType`.
- **`useJudgeInfo()`** — reads `judge_user` from `secureStorage`,
  bounces to `/judge/login` if missing/unparseable.
- **`useJudgePanelData({judgeInfo, session, refreshMs = 0})`** — the main
  hook. `refreshMs > 0` (Panel Review passes `10_000`) re-reads the panel on
  that interval and whenever the tab becomes visible again, until finalized.
  Returns:
  ```js
  {
    panelScores, setPanelScores,   // { [judgeType]: {judgeType, score, breakdown, timestamp} }
    panelSize,                      // 3|4|5|null, from GET judges list
    judgeNameMap,                   // { judgeType: displayName }
    finalized, setFinalized,
    socket, isConnected,
    refetchScores,                  // = fetchExistingScores
    panelScoresCount,               // count of panelScores keys that are real PANEL_TYPES
    effectivePanelSize,             // panelSize || panelScoresCount || 0
    orderedPanelEntries,            // PANEL_TYPES-ordered [judgeType, data] pairs present
    allPanelSubmitted,              // effectivePanelSize > 0 && panelScoresCount >= effectivePanelSize
    isSeniorJudge,                  // resolveJudgeSeat(...).judgeType === 'Senior Judge', for THIS category
  }
  ```

## Internal behavior worth knowing

1. **Panel-seat collapsing**: loads `panelSize` from
   `judgeAPI.getJudges(...)` filtered by category, narrowed via
   `panelSeats(judgesData, selectedApparatus)` (see
   [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)). Comment (`:267-275`)
   explains a meet mid-re-seating can return **both** a legacy
   category-wide seat and a new apparatus-specific seat for the same
   role — `panelSeats` collapses these to one seat per role.
2. **Score matching is by (playerId, apparatusKey), never player
   alone**: loads already-submitted slips via `judgeAPI.getTeamScores`
   — explicitly **not** `/public/scores` (`:298-303`, which only
   returns locked/finalized sheets, useless mid-session). Matches the
   target `playerScore` by both `playerId` and `apparatusKey`
   (`:326-330`) — an athlete with 3 apparatus has 3 score rows; matching
   on player alone would show the Rope panel the Pole marks and
   overwrite them on submit. **The server wins** for every slip it holds:
   loaded slips are merged **over** what is on screen
   (`{ ...prev, ...loadedPanelScores }`). It used to be the other way round
   (`{ ...loaded, ...prev }`), so a slip already on screen could never be
   corrected by a read — the Senior Judge kept another judge's old score
   whenever the live broadcast was missed (fixed 2026-09-26).
3. **Two score-document shapes are merged**: reads both `judgeSlips[]`
   (role-coded `SR_JUDGE`/`SJ`/`J1`-`J4`, with `SJ` "accepted too for
   older rows" per `:344`) and a flat `judgeScores{seniorJudge,
   judge1...}` object (legacy shape) — merges both, preferring
   `judgeSlips`.
4. **One socket connection** (URL `apiConfig.getSocketUrl()`), joins
   `scoring_${gender}_${ageGroup}_${competitionType}`. On a
   **re-connect** it re-reads the panel (anything broadcast while it was down
   is lost). Listens for `score_updated` (updates `panelScores` for the
   matching player+apparatus+judgeType, sets `finalized` if
   `isFinalSubmit`/`isLocked`; an event with **no breakdown** whose total is
   unchanged keeps the sections already on screen instead of blanking them —
   a sheet-level save carries totals only), `scores_saved_notification` (sets
   `finalized`, toasts — apparatus-matched "because it matters more
   here: this one locks the slip"), and `scores_saved_error` — see
   [09-REALTIME.md](../09-REALTIME.md#a-client-only-event-scores_saved_error-has-no-server-emitter--confirmed-and-theres-a-sibling-that-already-got-cleaned-up)
   for the confirmed finding that this listener has **no live server
   emitter** (verified by direct grep of `Server/src` for both the
   literal string and a `SCORES_SAVED_ERROR` constant — zero matches).
   The file's own comment correctly documents a *sibling*
   dead event, `score_update_error`, as deliberately removed from this
   same file — but the remaining `scores_saved_error` listener (`:568`)
   is an equally dead leftover that cleanup missed, and a
   near-identical listener also exists in `AdminScoring.jsx` (`:172`).
   Still present 2026-10-18.
5. **Apparatus matching inside socket handlers reads through a
   `selectedApparatusRef`** (`:413-414, 473-474`), deliberately **not**
   a dependency of the socket effect — changing apparatus mid-session
   must not tear down/rejoin the socket room.
6. **`isAuthFailure` helper** (`:32-35`), applied in every catch block
   in this file: checks for 401/403 and shows an explicit "session
   expired" toast rather than silently leaving the panel looking empty.
   Comment explains the prior behavior let a Senior Judge believe no
   one had submitted, leading them to either re-enter marks or wait
   indefinitely — this is the same HIGH-W3 "don't let an auth failure
   look like empty state" pattern applied a third time (see
   [08-API-INTEGRATION.md](../08-API-INTEGRATION.md)).

## Change guidance

- If you're removing the dead `scores_saved_error` listener: remove it
  from **both** this file (`:568`) and `AdminScoring.jsx` (`:172`) in
  the same change — see [09-REALTIME.md](../09-REALTIME.md).
- Never treat `resolveJudgeSeat`'s output as an authorization decision
  — it's UI convenience only; the server independently re-derives and
  enforces the seat.
- If adding a new socket-driven update, match on `(playerId,
  apparatusKey)`, never player id alone — this is the exact bug class
  item 2 above exists to prevent.
