---
doc: SHARED-CONTRACTS
covers:
  - src/utils/scoring/copRules.js
  - src/utils/scoring/copRulesSync.js
  - src/utils/scoring/competitionFee.js
  - src/utils/scoring/competitionLock.js
  - src/utils/scoring/apparatus.js
  - src/utils/scoring/judgePanel.js
  - src/utils/competition/levels.js
read_when: "changing ANY scoring math, fee/late-fee math, the competition-lock boundary, apparatus-shape reading, or panel-size logic on either stack — this is the file that tells you the other stack exists"
depends_on: [11-SCORING-CLIENT]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Why this doc exists

This is a monorepo with **two independent implementations of the same
domain rules** — one in `Server/src/{config,utils}/**`, one in
`Web/src/utils/{scoring,competition}/**`. Both are real, both run in
production, and there is no served single source of truth for most of
them (a `GET /api/public/cop-rules` endpoint exists and is *checked*
against, but the client never *depends* on it — see "The COP rules"
below). If you change one side without the other, nothing throws:
the two stacks quietly compute a different answer for the same input,
and it takes the specific form of a coach being charged the wrong fee,
a slip saving a wrong total, or a screen showing "editable" for a
competition the server will 423.

**Not all of these pairs are protected the same way.** Three have an
automated cross-stack test that literally imports the server file into
a Vitest run and asserts identical output at the real inputs. The rest
are either hand-verified-identical-in-prose (this doc) or genuinely
client-only with no server counterpart to drift from. Knowing which
bucket a change falls into is the point of this table:

| Pair | Client file | Server file | Guarded by an automated cross-stack test? |
|---|---|---|---|
| COP static tables (ceilings, element values, difficulty mix, tolerance tiers, time deductions, combination checklists, edition) | [copRules.js](../src/utils/scoring/copRules.js) | [cop-rules.js](../../Server/src/config/cop-rules.js) | **Yes** — [copRulesSync.test.js](../src/utils/scoring/copRulesSync.test.js), via [copRulesSync.js](../src/utils/scoring/copRulesSync.js) |
| Panel averaging methodology (3/4/5-judge drop-high-low, tolerance/base-score rule) | `calculateAverageMarks` in copRules.js:216-328 | `calculateIndividualScore` in [calculation.util.js](../../Server/src/utils/scoring/calculation.util.js):33 | **No** — see "The averaging methodology is NOT sync-tested" below |
| Difficulty cascade (C→B→A fill order) | `resolveDifficultyValue` in copRules.js:146-188 | (same file, `calculateIndividualScore`'s difficulty path) | **No** — same gap |
| Fee window / late fee / team total | [competitionFee.js](../src/utils/scoring/competitionFee.js) | [payment.config.js](../../Server/src/config/payment.config.js) | **Yes** — [competitionFeeSync.test.js](../src/utils/scoring/competitionFeeSync.test.js) |
| Competition-lock boundary | [competitionLock.js](../src/utils/scoring/competitionLock.js) | [competition-lock.util.js](../../Server/src/utils/security/competition-lock.util.js) | **Yes** — [competitionLockSync.test.js](../src/utils/scoring/competitionLockSync.test.js) |
| Apparatus-shape reading (3-shape `Mixed` field) | [apparatus.js](../src/utils/scoring/apparatus.js) | [apparatus.util.js](../../Server/src/utils/data/apparatus.util.js) | **No** — see "apparatus.js has no drift detector" below |
| "Unset apparatus = eligible for anything" gate | `isRegisteredFor` in apparatus.js:89-94 | ⚠️ UNVERIFIED — no equivalent found in apparatus.util.js; likely lives in a route/controller instead | **No** |
| Competition levels enum | [levels.js](../src/utils/competition/levels.js) | `Competition.level` enum in `Server/src/models/Competition.js` | **No** — 4-value static enum, low drift risk, no test either direction |
| Tie-break math | *(none — client-only display of server-computed results)* | [tie-breaker.util.js](../../Server/src/utils/scoring/tie-breaker.util.js) | N/A — deliberately not duplicated, see below |

## The COP rules: server is "authoritative for detection", client is "authoritative for availability"

`copRulesSync.js` header (lines 1-29) states the design explicitly and
it is worth repeating because it is not the obvious choice: the natural
fix for "two copies of the COP rules" is to delete the client copy and
fetch `GET /api/public/cop-rules` at runtime. **That was considered and
rejected.** Two reasons, both load-bearing:

1. The original defect (MED-W5) was never "duplication" — it was
   **silence**. The client computes a slip total client-side and posts
   it; the server range-checks it against section ceilings but does
   not *recompute* it from scratch. So if the two tables drift, the
   server doesn't reject the drifted score — it accepts a wrong one.
   Deleting the client copy doesn't fix that; the server would still
   need to actually recompute to catch a bad total.
2. Judge tablets score on venue wifi during a live competition. Making
   every slip render depend on a network fetch succeeding trades a
   silent-drift risk for a scoring-is-down risk — worse in practice.

So the resolution is: **the bundled client tables remain authoritative
for availability** (scoring never blocks on network), and
`verifyCopRulesAgainstServer()` (copRulesSync.js:170-197) is a
**non-blocking, failure-tolerant monitor** — it fetches the server's
rules once, diffs them via `compareCopRules()`, and `logger.error`s
loudly on drift (or `logger.warn`s and gives up silently on a failed
fetch — offline/older-server/endpoint-absent are all treated as fine).
It never throws into a caller and never blocks a slip from being typed
or saved. ⚠️ UNVERIFIED: which screen actually calls
`verifyCopRulesAgainstServer()` and when (once per app load? once per
judge session?) — grep `verifyCopRulesAgainstServer` before assuming
it runs on a path you're touching.

### What `compareCopRules` actually compares — and what it does not

Read `compareCopRules` (copRulesSync.js:57-159) as the precise
definition of "in sync": it diffs `edition`, `pointCeilings`,
`elementClassValues`, `difficultyRequirements`, `timeLimitSeconds`,
`timeMinimumSeconds` (since 2026-09-27; skipped when an older server doesn't
send it), then **evaluates the client's `getTolerance`/`getTimeDeduction`
functions at the server's declared tier boundaries** (rather than
diffing table shapes — this survives either side refactoring an
if-ladder into a data table), then diffs `combinationChecklists` by id
and `penalty` per apparatus. Checklist **rule text** is intentionally
excluded from `differences` and reported separately as
`textDifferences` — a reworded requirement changes no score, so it must
not raise the runtime drift alarm. Since 2026-09-25 both stacks quote
COP Mallakhamb.pdf §2.3.2.1–2.3.2.3 verbatim, and the wording is pinned
in CI instead: `copRulesSync.test.js` requires `textDifferences` to be
empty, and `copRules.test.js` holds the transcription itself.

**It does not compare `calculateAverageMarks` or
`resolveDifficultyValue` output at all** — see next section.

## The averaging methodology is NOT sync-tested — the highest-value gap in this whole file

This is the most important non-obvious finding in the shared-contracts
investigation. `calculateAverageMarks` (copRules.js:216-328) is the
function that turns a panel's raw marks into the number that gets
saved as a competitor's score — the 3-judge flat mean, the 4-judge
"inject the Chief into the vacant slot and run the 5-judge rule"
method (see the chief-copy note at copRules.js:268-281), and the 5-judge
drop-high-low-average-the-middle-two method, plus the
tolerance/base-score check against the Senior Judge's mark
(copRules.js:289-327). Its server counterpart is
`calculateIndividualScore` (calculation.util.js:33).

**`copRulesSync.test.js` never calls either function.** The automated
cross-stack comparator (`compareCopRules`) only diffs the *static
tables* (ceilings, checklists, tier boundaries) — it has no assertion
that feeds the same judge marks into both `calculateAverageMarks` and
`calculateIndividualScore` and requires equal output. The only guard
that exists is inside `copRules.test.js` itself: a handful of tests
with names like *"mirrors the server: same numbers as
Server/src/utils/scoring/calculation.util.js"* (copRules.test.js:235-240)
that assert a **hardcoded expected number**, manually copied from the
server's own test suite at write time. That is a snapshot of agreement
on the day the test was written, not a live cross-stack check — if
`calculateIndividualScore` on the server changes its rounding, its
drop rule, or its tolerance-tier lookup, nothing in either test suite
will fail. Same gap applies to `resolveDifficultyValue`'s C→B→A cascade
(copRules.js:146-188): no server cross-import verifies it either.

**Practical implication**: if you are asked to change how a panel's
marks are averaged, or how the difficulty cascade fills slots, changing
`copRules.js` alone (or `calculation.util.js` alone) will pass CI on
both sides and silently start scoring competitors differently depending
on which surface computed the number. Grep both files together and
change them in the same commit; there is no test that will catch you
if you don't.

## The fee window and the competition lock: sync-tested, and pinned to the same boundary as each other

`competitionFee.js` and `competitionLock.js` are each independently
sync-tested (`competitionFeeSync.test.js`, `competitionLockSync.test.js`)
by importing the real server modules
(`Server/src/config/payment.config.js`,
`Server/src/utils/security/competition-lock.util.js`) and asserting
identical output at nine boundary instants spanning "long before the
window opens" through "long after" — including the exact millisecond
before and after each transition (e.g.
`'2026-12-13T23:59:59.999Z'` vs `'2026-12-14T00:00:00.000Z'`,
competitionLockSync.test.js:47-49). These are the two tests to run
first if you touch either fee or lock logic.

**The two are also pinned to each other**, not just to their own
server counterpart: `competitionLockSync.test.js`
("the lock closes exactly when the fee window does", lines 84-105)
asserts `lockInstant(competition).getTime()` equals
`resolveFeeWindow(competition, ...).closesAt.getTime()` — both read
`endOfUtcDay(endDate)` from the server's shared
`Server/src/utils/data/day-boundary.util.js`, and the test's own
comment explains why this matters: "a gap either way is a window where
a coach's money moves into a meet nobody can then record it against."
It also asserts the one-directional invariant that actually protects
money: a **locked** competition must never show `canPay === true`
(competitionLockSync.test.js:94-104) — the reverse (payable while
still... unlocked before opening) is fine and expected.

See [09-PAYMENTS](../../Server/MEMORY/09-PAYMENTS.md) for the fee-window
rule on the server side, and
[06-AUTH-AND-SECURITY](../../Server/MEMORY/06-AUTH-AND-SECURITY.md) /
[04-DATA-MODEL](../../Server/MEMORY/04-DATA-MODEL.md) for the lock
semantics (423, not 403; superadmin bypass only —
`mayBypassCompetitionLock` agreement is asserted directly,
competitionLockSync.test.js:72-81).

## Team size: a labelled mirror, no test

`src/utils/scoring/teamSize.js` (`TEAM_SIZE_OPTIONS` 4→3 / 6→5,
`DEFAULT_TEAM_SIZE = 6`, `countedScoresFor`) mirrors `TEAM_SIZE_COUNTED` /
`DEFAULT_TEAM_SIZE` in `Server/src/utils/scoring/team-championship.util.js`
by hand. The server does all counting; this copy only labels the choice and
the cap ("best 3 count"). No cross-stack test. ⚠️ Its header still says the
size is declared by a coach when creating a team — it has been the
superadmin's per-competition `maxTeamSize` since 2026-09-26.

## `apparatus.js` has no drift detector — verified identical by direct reading only

**Per-gender offer (2026-09-25):** `offeredApparatus(competition, type,
gender)` mirrors the server's `utils/data/competition-apparatus.util.js` of the
same name — reads `apparatusByGender`, falls back to the per-type
`apparatusConfig` less what COP bars the gender from (Hanging for women).
Used by the coach dashboard, judge dashboard, Manage Judges and the
superadmin competition form. Also untested against the server.

Unlike the three pairs above, **no test file imports
`Server/src/utils/data/apparatus.util.js` into the Web test suite.**
`apparatus.test.js` (confirmed by grep: zero references to `Server/src`)
tests only the client function in isolation. The two were compared here
by direct reading (2026-09-23) and found consistent on the parts that
overlap:

- Both read the same three historical shapes of
  `registeredTeams[].players[].apparatus` (bare string / flat array /
  object keyed by competition-type slug) — see the near-identical
  doc-comment history in both files (apparatus.js:1-20,
  apparatus.util.js:1-37).
  Server calls the canonical shape **the object keyed by
  competition-type slug**; `apparatus.js` doesn't independently assert
  a canonical shape, it just reads all three the same way the server's
  `apparatusList` does.
- Both ignore `competitionType` entirely for the string/array shapes,
  and for the object shape, both return `[]` (not a fallback) when a
  specific `competitionType` is asked for and the object has no key for
  it. (This was the one place a misreading is easy — `apparatusFor`'s
  "fall back to everything" branch at apparatus.js:70-73 only fires
  when `competitionType` is falsy, matching `apparatusList`'s own
  `Object.values(value).flatMap(toList)` fallback for the
  no-`competitionType` case.)
- Server's `apparatus.util.js` additionally exports
  `toCanonicalApparatus` and `isCanonicalApparatus`, used by migration
  008 to normalize stored rows — **the client has no equivalent and
  does not need one**, since it only ever reads.

**What is NOT mirrored, and has no server equivalent to compare
against**: `isRegisteredFor`'s "an entry with no apparatus recorded is
eligible for anything being judged" rule (apparatus.js:80-94). This is
a real scoring-eligibility gate — it decides whether an athlete shows
up on a judge's roster for an apparatus — and ⚠️ UNVERIFIED whether the
equivalent gate exists on the server (in a route or `AdminService`
method rather than in `apparatus.util.js`, which only reads/normalizes
the field and does not filter by eligibility). If you're asked to
change roster-eligibility filtering, search
`Server/src/services/admin/**` and `Server/src/routes/**` for the
matching logic before assuming `apparatus.util.js` is the whole story
server-side — it isn't.

## `judgePanel.js`: the panel-size math is shared, the seat-drawing is not

`judgePanel.js` mixes two different kinds of logic and they have
different answers to "does this need to match the server":

- **`panelSeats`** and **`soleApparatus`** are pure client concerns —
  turning a flat list of judge-seat rows (as `GET .../judges` returns
  them) into one panel per role, narrowed by apparatus. No server
  equivalent exists because the server never assembles a "panel" shape
  for display; it just returns seat rows. Nothing to drift.
- **`mirrorChiefSeat`** is display-only and explicitly says so in its
  own doc comment (judgePanel.js:94-107): it exists purely so a
  4-judge sheet *draws* a fifth column mirroring the Sr. Judge, with
  three hard constraints on what that copy must never do — reach
  `judgeDetails` (the sat-panel record), reach `judgeScores.judge4`
  (no mark was actually given), or be counted as panel **size** for
  anything that picks an averaging method. That size-counting warning
  is the one to take seriously: **`judges.length` after
  `mirrorChiefSeat` has been applied is not the panel size** — always
  pass the real `panelSeats(...).length` (pre-mirror) into
  `calculateAverageMarks`/`analyzePanelMismatches`'s `panelSize`
  argument, never the post-mirror array length.
- The actual **rule** the mirroring reflects — that a 4-judge panel's
  Sr. Judge mark is injected into the vacant fourth evaluation slot and
  then run through the 5-judge method — is real shared scoring logic,
  implemented in `calculateAverageMarks` (copRules.js) and mirrored on
  the server in `calculateIndividualScore`. That's the pairing covered
  (partially — see above) by copRules.test.js's hardcoded-expectation
  tests, not by `judgePanel.js` or its test.

## Tie-break math is deliberately NOT duplicated on the client

Unlike every other pairing in this doc, there is **no
`Web/src/utils/scoring/tieBreaker.js`**. The client never computes a
tie-break; it only ever displays a tie-break result the server already
computed and returned (typically on a rankings/results screen). This
was a deliberate non-duplication rather than a gap — the tie-break rule
itself is comparatively rare to invoke (only fires on an actual tie)
and computing it client-side would add a fourth sync-tested pair for a
calculation the UI never needs to run ahead of the network. See
`Server/src/utils/scoring/tie-breaker.util.js` for the rule itself
(COP §1.12 since 2026-10-17/18: 3-judge time → lucky draw; 4/5-judge base
score → mean of the four judges → (mean + Chief)/2 → lucky draw).

The two client pieces that touch tie-breaks stay display-only and are keyed to
the **server's reason codes**, which is the contract to keep in step:
`PlayerRankingBoard`'s `TIE_BREAK_LABELS` (one label per engine `reason`, plus
`awaitingLuckyDraw`), and `LuckyDrawPanel`, which groups rows by the server's
`tieBreakInfo.tieGroupKey` and only **sends** the drawn order — the server
validates it and applies it on the next read. Neither file orders athletes
itself. A new engine reason needs a label, or the card explains nothing.

## Competition levels: six values, sync-tested since 2026-09-26

`levels.js`'s `COMPETITION_LEVELS` is `district` / `state` / `national` /
`international` / **`dso`** (District Sports Office) / **`university`**, and
`levelLabel()` gives the display name. The server's list now lives in one
module, `Server/src/config/competition-levels.js` (read by the model enum and
both validators), and **`levels.test.js` imports it and fails if the two
drift** — a level missing on either side is a meet nobody can pick, or a pick
the server refuses. `normalizeLevel` returning `null` for an unrecognized
value is still the safety net for stale client state (localStorage/URL).

## Everything else in `src/utils/scoring/*` that is NOT a shared contract

`scoringPropTypes.js` is **not** a client/server pair — see
[11-SCORING-CLIENT](11-SCORING-CLIENT.md) for what it actually
documents (an internal client-only contract between `judgeShared.jsx`'s
`normalizeBreakdown` and the components that consume its output).
`analyzePanelMismatches` (copRules.js:339-491, the Panel Review
mismatch-detection logic) is likewise client-only — it exists to warn
judges *before* they submit, and has no server equivalent to drift from
because the server never runs a "do these judges agree" check itself.
