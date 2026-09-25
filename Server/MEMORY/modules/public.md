---
doc: modules/public
covers:
  - src/services/public/**
  - src/controllers/public.controller.js
  - src/routes/public.routes.js
  - src/validators/public.validator.js
  - src/services/cache/**
read_when: "changing an unauthenticated read or its caching"
depends_on: [10-CACHING-AND-PERF, 04-DATA-MODEL]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Purpose

Unauthenticated (and a couple of misleadingly-named not-actually-public)
reads. Cache mechanics live in
[10-CACHING-AND-PERF.md](../10-CACHING-AND-PERF.md) — this doc covers the
public-read service itself plus feature flags, which share the directory
tree but not much else.

## `public.service.js` (`PublicService`)

Constructor deps: `competitionRepository`, `scoreRepository`, `adminService`
(optional), `logger`.

| Method | Contract |
|---|---|
| `getPublicScores(competitionId, filters)` | `competitionId` **required** at both validator and service layer — an earlier version allowed it optional and dumped the entire unpaginated DB (19.5MB/1.4s on one fixture). Two-gate publish rule: a row must be `isFinalized===true` AND either whole-doc `isLocked` or its apparatus present in `lockedApparatus`. Strips `-createdBy -updatedBy` and per-row slip breakdowns (`stripSlipBreakdowns`). Ranks **server-side** (`rankPlayerRows`) so tie-break logic stays in one place, never recomputed in the browser |
| `getPublicTeams(competitionId)` | No `competitionId` → `[]`, not an error. Only `isSubmittedRegistration` teams. Player fields hard-narrowed to `SUBMITTED_TEAM_PLAYER_FIELDS` at both the populate and the mapping layer — fixes a prior leak of `dateOfBirth` for (mostly minor) athletes |
| `getPublicCompetitions()` | Thin wrapper over `competitionRepository.findActive` |
| `getPublicRankings(competitionId, ageGroup)` | **Unreachable — no route mounts it.** Would call `adminService.getTeamRankings`/`getIndividualRankings` in parallel if it were wired up; confirms `adminService` really is injected here (per `bootstrap.js`), but its only live use today is this dead method |

`enrichPlayerScore` delegates to the shared util so the public feed and the
admin feed compute identical numbers — never a separate calculation.

## Route table — `/api/public`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/competitions` | public | |
| GET | `/cop-rules` | public | `ETag` = sha1 of the payload, `Cache-Control: public, max-age=3600`, honors `If-None-Match` → 304 |
| GET | `/judges` | authenticate + `requireScoringAccess` | **Not actually public despite the path** — reuses `adminController.getJudges` |
| GET | `/submitted-teams` | authenticate + `requireScoringAccess` | **Not actually public** — reuses `adminController.getSubmittedTeams`, which is the real "which teams are in this category" definition (shared with the judge dashboard) — `publicService` does **not** call it |
| GET | `/teams` | public | `publicValidator.getPublicTeams()` — `competitionId` optional |
| GET | `/scores` | public | `publicValidator.getPublicScores()` — `competitionId` required |
| POST | `/save-score` | authenticate + `requireScoringAccess`, unlocked | The path the deployed judge client actually posts to — see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) |
| POST | `/payments/razorpay/webhook` | public, HMAC | See [09-PAYMENTS.md](../09-PAYMENTS.md) |

## Feature flags — removed 2026-09-23

`FeatureFlagService` (`src/services/feature-flags/`) was fully implemented
but had zero live callers anywhere in the app — `feature-flag.middleware.js`
(its only consumer) was deleted in the 2026-08 audit and nothing replaced
it. Rather than leave it wired into DI with no caller, the whole directory
was removed: the class, its DI registration
(`src/infrastructure/bootstrap.js`), and the now-unused
`getFeatureFlags()`/`features.flags`/`FEATURES_FLAGS` config surface
(`src/config/config-manager.js`) are all gone. See
[modules/feature-flags.md](feature-flags.md) and GOTCHAS.md. If a real need
for feature flags comes up again, this is a from-scratch rebuild, not a
revival.

## Change guidance

- A new public read: narrow the projection explicitly (follow
  `getPublicTeams`'s pattern of allow-listing fields at both the query and
  the mapping layer) — anonymous PII exposure has happened here before
  (CRIT-4).
- Don't route a new public endpoint's team-list logic through
  `publicService` if it needs to match the judge dashboard's definition of
  "which teams are in this category" — call `adminService.getSubmittedTeams`
  (or its repository-level `findSubmittedRegistrations`) directly instead,
  the way `/api/public/submitted-teams` already does.
