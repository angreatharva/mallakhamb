# Migration status

Tracking file for the Spring Boot migration (plan:
[docs/springboot-migration](../docs/springboot-migration/README.md), roadmap
[06](../docs/springboot-migration/06-ROADMAP.md) §5). Updated 2026-11-14.

## Where things are

| | |
|---|---|
| Current stage | **Stage 1: discovery and recordings**, started 2026-11-14 |
| Lead branch | `migration/springboot` (merged into `master` only at cutover) |
| Stage branch | `migration/stage-1-discovery` (merged into the lead branch when the Stage 1 gate passes) |
| Pushed | Nothing. All migration branches are local |
| Node backend | Untouched. `Server/` is only read by the tools |

## Differences from the written plan

| Plan says | What is done | Why |
|---|---|---|
| No migration code before 21 Dec 2026 (D2) | Local work started 14 Nov on the owner's instruction | D2 protects shared things. Nothing here touches the VMs, CI, `master`, a deploy or a remote branch, and that stays true until 21 Dec |
| The backend lives in `backend/` | It lives in `mallakhamb-backend/` | The owner's Spring Initializr project. Read every `backend/…` path in the plan as `mallakhamb-backend/…` |
| Root package `com.mallakhamb` | Initializr generated `com.mallakhamb.mallakhamb_backend` | Renamed in Stage 2 when `:app` is set up |

## Stage 1 checklist

| Task (06 §2) | Status | Notes |
|---|---|---|
| Port kit: `gen-enums`, report mode | **Done** | `tools/node/gen/gen-enums.js` → `generated/vocabulary.json`, `generated/VOCABULARY-DRIFT.md` |
| Port kit: `gen-catalogues`, report mode | **Done** | `tools/node/gen/gen-catalogues.js` → `generated/catalogues.json`, `generated/CATALOGUE-REPORT.md` |
| Publish the drift report | **Done**, decisions open | See "Open decisions" below |
| Port kit: `context-pack` | Not started | Needs the call tracer and the corpus |
| Golden engine vectors (`tools/node/golden`) | **Done** | `golden/cop-2022-11/`: 26,178 committed cases in 96 functions; the 1,001,800-case set is rebuilt on demand and its hashes are committed |
| `twinrun` and the HTTP corpus | **Harness done; corpus 1 of 5 sources** | Recorder, replayer, response and stored-data comparison work. Recorded so far: `testapi` (137 requests, 92 operations). See "Twin-run" below |
| Socket recorder and recordings | Not started | |
| Call tracer (DI-container proxy) | Not started | |
| Contract capture (headers, cookie attributes, CSRF format) | Partly | Every recorded response keeps all its headers and `Set-Cookie` lines (`twinrun/corpus/*/requests.jsonl`). The summary files under `contract/` are not written yet |
| `--target` on `testApi.js` | Not started | |
| Re-run the audit, regenerate `openapi.json` and `API-MATRIX.md` | Not started | Planned for 21 Dec so the December changes are included |
| Node baseline on the OCI VM shape | **Blocked until 21 Dec** | Runs on the VMs (D2) |

**Gate:** the corpus replays against Node twice with zero diffs; vectors generated; baseline recorded.

## What the generators found

- **80** enum-constrained Mongoose fields (the plan counted 77), grouped into **29** kernel enums (the plan lists 28).
- **30** distinct error codes are sent; `error-codes.js` declares 24, of which only 12 are ever used. **18** codes are used without being declared.
- No code is sent with two different HTTP statuses, so `ErrorCode` can carry one status per code as designed.
- **350** distinct user-facing messages at 404 sites; **37** `NotFoundError` resource names at 170 sites.
- **29** socket events are sent. `edits_restored` is sent but not declared in `event-types.js`; five events are sent as string literals.
- Auth cookies are per role (`access_token_<role>`, `refresh_token_<role>`), plus `csrf-token`.
- **11** environment variables are read outside the config manager at 19 sites (the plan counted 17 reads).

## Golden vectors

`tools/node/golden/generate.js` runs the real Node functions and records input and output. The Java engines must give the same output.

| Suite | Functions | Committed cases | Full set |
|---|---|---|---|
| scoring | 16 | 3,612 | 100,412 |
| score sheet (final score, time deduction, slips, published rows) | 10 | 3,673 | 100,081 |
| ranking and tie-break | 14 | 4,939 | 100,147 |
| finals qualification | 3 | 1,221 | 100,023 |
| team championship | 7 | 1,657 | 100,057 |
| fees | 10 | 2,906 | 100,108 |
| panel | 13 | 2,151 | 100,151 |
| eligibility | 9 | 2,304 | 100,304 |
| running order | 7 | 1,496 | 100,298 |
| jsnumber (primitives for `JsNumber`) | 7 | 2,219 | 100,219 |
| **Total** | **96** | **26,178** | **1,001,800** |

Each function's cases are, in order: fixed cases, the COP's worked examples, the examples from Node's unit tests, then seeded-random cases.

Checked:

- The committed cases replay exactly against Node, and two runs give identical hashes.
- Every tie-break step (time, base score, four-judge average, average with Chief, lucky draw) and all four fee phases are reached.
- **Node gives the answers printed in the Code of Points** for its worked examples: §2.1.2 (average 8.10), §2.1.3 (base score 9.225 at tolerance 0.10) and §1.8.3.4–5 (the age cut-off). A test pins this.
- 223 worked examples come from 17 of Node's unit-test files (`golden/examples.json`, built by `capture-examples.js`). The tests run twice and only inputs seen both times are kept, so nothing built from "now" or a random id gets in.

Differences from 04 §3:

| Item | State |
|---|---|
| fast-check | Not used. A seeded generator written in the tool is used instead, so committed vectors don't change when a library is upgraded |
| 100,000 cases per engine committed | Only the hashes are committed (`manifest.full.json`); the files are rebuilt with `npm run golden:full` in under a minute |
| The lot draw | Its result is random, so it can't be a vector. The algorithm is pinned instead: `runningorder/shuffleWith` feeds the real shuffle a recorded list of random numbers. The draw's randomness is checked by invariant in the twin-run (04 §2) |
| `sortByStoredPosition` | Takes a callback in Node; the vector always sorts unordered rows by `name` |
| JavaScript runtime errors (a null dereference) | Only the error kind is recorded (`TypeError`), not V8's wording |
| Functions that default to "now" (`resolveFeeWindow`, `checkAgeGroup`, `buildJudgeSlipPlayerScore`) | Always called with an explicit time or year |

Notes for the Java engines (things the vectors will catch):

- `allRoundAgeGroup` and `sortByStoredPosition` order strings with `localeCompare`. For ids (lower-case hex) that is plain character order; for names it is locale order (`akash` before `Akash`, `Team 10` before `Team 2`), which a Java `String.compareTo` does not give.
- `calculateTimeDeduction` (service) and `timeInSeconds` (tie-break) parse a time string differently; both are pinned separately.

Still open in Stage 1 for the engines: the rules that live inside services with database access (roster ordering in `getOrderedRoster`, the sequence checks in `setTeamOrder` / `setPlayerOrder`, `getTeamScores`). Those are covered by the twin-run corpus, not by vectors.

## Twin-run

`tools/node/twinrun` records what Node answers and replays it. Today it replays against Node; in Stage 2 the same command points at Java (`--url`).

| Check | Result |
|---|---|
| Corpus `testapi` recorded from `Server/scripts/perf/testApi.js` | 137 requests, 92 distinct operations; the harness itself reported 138 pass, 0 fail, 3 skipped |
| Replay against Node, run repeatedly | 137/137 requests match, 92/92 operations green, stored data matches, every run |
| Comparator fails when it should | 11 tests: a changed string, number, type, array order, extra or missing field, key order, status, header, cookie attribute, token claim, stored type, missing `__v`, unhashed password |

How a replay stays comparable:

- **Same start:** the database is restored from the corpus snapshot, and the clock starts at the recorded instant (only `Date` is shifted).
- **Normalised, nothing else:** generated ids (mapped one-to-one), tokens (claims compared), timestamps.
- **Invariants** (`twinrun/invariants.json`, each with a reason): `csrfToken`, `correlationId`, the two health endpoints (they report the process's own memory), and stored `password`, `tokenHash`, `family`.
- **The lot draw** is random, and everything after it follows its order. The replayer checks the rule (same teams and athletes, lots 1..N) and then sets the replay's stored order to the recorded one. No random source is shared between the two sides.

Safety: `Server/.env` points at the Atlas database and a real mail provider. The twin-run sets its own environment first, refuses anything but `mongodb://127.0.0.1/twin_test_*`, uses twin-only secrets, and turns mail, Razorpay and OCR off. The recorded corpus was checked for real keys and addresses: none.

Not done yet:

| Item | State |
|---|---|
| Corpus from `setup:api`, `meetDay.js`, `openapi.json` (one request per operation and response code), the security cases | Not recorded. 92 of the 220 operations are covered so far |
| Stored-data check after **each** write | Done once, at the end of the run. Per-write comparison needs both sides running together (Stage 2) |
| `allowed-diffs` file | Not created; it starts when there is a Java side to differ |
| Call tracer and `context-pack` | Not started |
| Socket recorder | Not started |
| Multipart uploads (walk-in forms) | The recorder notes them but can't replay them yet; none in `testapi` |

## Open decisions (lead and owner, before milestone 2a)

Proposals are in the reports; none changes a stored or wire value.

| # | Row | Proposed | Decision |
|---|---|---|---|
| V1 | `Team.sex` vs `gender` everywhere else | Java field `gender`, mapped with `@Field("sex")` | |
| V2 | `AllAges` valid on categories, not on athletes or entries (12 fields) | One `AgeGroup` with named sets `ENTRY` and `CATEGORY` | |
| V3 | `Score.competitionType` stores `Competition I`, the rest store `competition_1` | One `CompetitionType`; `DisplayForm<CompetitionType>` on scores | |
| V4 | `Qualification.competitionType` allows only II and III | Named set `CompetitionType.FINALS` | |
| V5 | Four different role lists (`AccountRequest`, `decidedBy`, `Admin.role`, `AuditLog`) | One `Role` with a named set per field | |
| V6 | `AccountRequest.newEmailType` has no `none` | Named set `EmailType.CHANGEABLE_TO` | |
| V7 | `Score.playerScores[].panelSize` (3, 4, 5) is not in the plan's enum list | A 29th kernel enum `PanelSize` | |
| V8 | `bonusScore` and element `value` are Mongoose enums of COP numbers | Rulebook data, no kernel enum | |
| C1 | 18 error codes used but not declared | Add each to `ErrorCode` with the status found | |
| C2 | 12 error codes declared but never used | Keep only those a recording shows on the wire | |
| C3 | `EDIT_LIMIT_REACHED` has no status next to it | Read the status from the recording | |
| C4 | `edits_restored` is not in `event-types.js` | Add it to `RealtimeEvent` | |

## Blockers

None.

Resolved: JDK 25 (Eclipse Temurin 25.0.5+8) installed on the dev machine on 2026-11-14 at
`C:Program FilesEclipse Adoptiumjdk-25.0.5.8-hotspot`. `gradlew build` of the
unmodified Initializr project passes on it (compile, context-load test, `bootWar`).
JDK 17 is still installed; Gradle picks 25 through the toolchain setting in `build.gradle`.

## Module table

Empty until Stage 4.

## Sign-offs

None yet.
