---
doc: 06-SCREENS/time-keeper-scoring
covers:
  - src/pages/judge/TimeKeeperScoring.jsx
  - src/pages/judge/timeKeeper.js
  - src/pages/judge/StopwatchFace.jsx
  - src/pages/judge/stopwatchPalette.js
read_when: "changing the Time Keeper's stopwatch, how a stopped time reaches the Scorer's sheet, or the 60/90 s beeps"
depends_on: [06-SCREENS/judge-scoring, 06-SCREENS/scorer-scoring, 09-REALTIME, SHARED-CONTRACTS]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/judge/TimeKeeperScoring.jsx` (258 lines), route `/judge/scoring`,
reached through the `JudgeScoring` dispatcher when the judge holds the **Time
Keeper** seat (seat 7) in the chosen category — see
[judge-scoring.md](judge-scoring.md) for the dispatch rule. Added 2026-09-26/27
with the seat itself; the seat is **required** on a panel and may be held by
the same person as the Scorer (the judge dashboard then asks which role to open).

The screen shows the stopwatch first, then the team's athletes (rows built by
the Scorer sheet's own `buildScorerRows`, so the two screens list the same
rows in the same order, keyed `${playerId}::${apparatusKey(apparatus)}`).

## Guarding the route

The role follows the **category**, not the account: on mount it checks
`seatTypesFor(judgeInfo, {gender, ageGroup, competitionType, apparatus})`
(from `useJudgePanelData.js`) includes `'Time Keeper'`, else toasts "This page
is only for the Time Keeper of this category" and sends the judge to the
dashboard. No judge → `/judge/login`; no team/category → `/judge/dashboard`.
The session (team + category from the navigation state) is kept in
`sessionStorage['timekeeper_active_session']` so a refresh keeps working.

## The stopwatch — `timeKeeper.js` + `StopwatchFace.jsx`

- **Whole seconds only** (…59, 60, 61…), never minutes. The recorded time is
  the number on the display when Stop was pressed (elapsed rounded **down**),
  so the Time Keeper and the Scorer's sheet can't disagree.
- Elapsed time is measured **against the clock**, not by counting ticks, so a
  throttled or frozen tab still reads right when it wakes.
- **Beeps** (`BEEP_MARKS`): one at 60 s, two at 90 s — the edges of the
  deduction-free window. Each fires once even if a throttled tab jumps over it
  (`marksCrossed`). Web Audio, no sound file; the `AudioContext` is created on
  the Start press because browsers keep it silent otherwise.
- `deductionNote(seconds)` → e.g. "Deduction 0.30 · 5 s short" / "… 2 s over",
  empty inside 60–90 s, from `copRules.getTimeDeductionForTime` (the same table
  both ways — see [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)).
- `StopwatchFace` is an Apple-style analog face: a 60 s main dial and a 120 s
  sub-dial whose rim shows the window (amber before 60, green 60–90, red after).
  Hands are turned from `requestAnimationFrame` writing the SVG transform
  directly — React re-renders once a second (the readout), never 60×/s. Right
  button runs the clock (Start → Pause → Resume), left ends or clears it (Stop /
  Reset). The screen takes its stopwatch colours from `stopwatchPalette.js`
  (`STOPWATCH`); the face itself still hard-codes its hand orange (`#FF9F0A`),
  one of the few colour literals left in `src/`.

## How a time reaches the Scorer — socket only, nothing saved here

The screen opens its **own** socket (`apiConfig.getSocketUrl()`, judge token
in `auth`) and joins `scoring_${gender}_${ageGroup}_${compType}`. On Stop it
emits `time_record {roomId, playerId, teamId, apparatus, seconds}`. The server
relays it as `time_recorded` to the room (both room-id forms) and acks the
sender; only a socket that holds the Time Keeper seat **in that room** may send
one (see [09-REALTIME.md](../09-REALTIME.md) and Server
`08-REALTIME-SOCKETS.md`).

On the Scorer's sheet (`ScorerScoring.applyRecordedTime`) the time fills that
row's **Time** field as if typed (so the deduction preview updates), fills an
empty Time Keeper name from `timeKeeperName`, and toasts "Time N s recorded for
X". A time that arrives while the sheet is still loading is queued and applied
after. The Scorer's **save** is what persists it.

This screen keeps the session's times in `sessionStorage` (`{ [rowId]:
{seconds, sent} }`), so a refresh loses nothing, and offers **"Not received —
send again"** for a time that wasn't acknowledged. A closed competition shows
the `CompetitionLockBanner`.

## Tests

`TimeKeeper.flow.test.jsx` (the screen end to end), `timeKeeper.test.js`
(whole seconds, beep crossings, deduction note), `JudgeDashboard.role.test.jsx`
(the Scorer / Time Keeper role popup), `judgeSeat.test.js`.

## Change guidance

- Never persist a time from this screen: the Scorer's sheet is the one writer,
  so a time and its deduction are saved together.
- Keep the displayed and recorded number the same (floor of elapsed seconds).
- A new audible mark goes in `BEEP_MARKS`; the sub-dial reads the same list.
