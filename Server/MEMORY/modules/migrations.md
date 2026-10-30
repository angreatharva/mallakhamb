---
doc: modules/migrations
covers:
  - src/migrations/**
read_when: "writing or reasoning about a schema migration"
depends_on: [04-DATA-MODEL, modules/infrastructure]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

The full migration table (all 12, purpose, rerun-safety) and the "how to add
one" recipe live in
[04-DATA-MODEL.md](../04-DATA-MODEL.md#migrations-srcmigrations) — this is
a pointer entry so `src/migrations/` has its own module doc per the
directory-per-module convention. Runner mechanics (tracking collection,
ordering validation, batch-rollback-on-failure) live in
[modules/infrastructure.md](infrastructure.md#migration-runnerjs).

## One fact worth repeating here

Migrations do **not** auto-apply on `npm start` — this is deliberate (see
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md)). Some migrations here are
one-time, potentially-lossy data repairs with a documented, deliberately
irreversible `down()` (003, 007, 008) — read a migration's own header
comment before assuming `down()` is safe to run. 012 (Player IDs) has a
`down()` that **refuses** while siblings share a guardian address.

Render applies pending migrations at start (`MIGRATE_ON_START=true`, see [15-DEPLOYMENT.md](../15-DEPLOYMENT.md)); 012 went out with
`19a075d` (2026-10-20). An index whose key stays the same but whose options
change (012's partial unique email) can't be reconciled by the index manager
— it reports a conflict and keeps the old one — so such a change needs a
migration that drops the old index explicitly.

**014 — player teams per level (2026-10-28).** Reads every squad entry
(`registeredTeams[].players[]`) and sets `Player.levelTeams[level]` where only
ONE team ever entered the player at that level; two or more → a
`PlayerTeamConflict` (nothing guessed). Only fills levels with no team, so
re-runs are harmless; `down` pulls entries with `via: 'migration-014'` and the
unresolved conflicts. See [team.md](team.md).

## Since the last pass (2026-10-30, against `4201319`)

**013 — judge slip authors (2026-10-26).** Stamps `judgeAccountId` +
`attribution: 'inferred'` on slips written before authorship was recorded,
from today's seat assignments; by slip `_id` via arrayFilters; re-run no-op.
See [stats.md](stats.md).

**015 — drop the age cut-off override (2026-10-29).** Unsets
`Competition.ageCutoff`; the cut-off is always 31 Dec of the start year.

**016 — automatic finals (2026-10-30).** Meets already scored or ended get
`legacyFinals: true` and keep their coach-chosen Competition II/III entries;
every other meet has those coach-chosen keys cleared so the engine owns them.
Then the finals are computed. Deploy note: a release carrying a new migration
goes to the ACTIVE OCI VM first.
