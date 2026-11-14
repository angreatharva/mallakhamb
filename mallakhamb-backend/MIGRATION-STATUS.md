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
| Golden engine vectors (`tools/node/golden`) | Not started | |
| `twinrun` and the HTTP corpus | Not started | Needs a local MongoDB with seed data |
| Socket recorder and recordings | Not started | |
| Call tracer (DI-container proxy) | Not started | |
| Contract capture (headers, cookie attributes, CSRF format) | Not started | |
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
