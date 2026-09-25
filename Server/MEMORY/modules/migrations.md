---
doc: modules/migrations
covers:
  - src/migrations/**
read_when: "writing or reasoning about a schema migration"
depends_on: [04-DATA-MODEL, modules/infrastructure]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

The full migration table (all 11, purpose, rerun-safety) and the "how to add
one" recipe live in
[04-DATA-MODEL.md](../04-DATA-MODEL.md#migrations-src-migrations) — this is
a pointer entry so `src/migrations/` has its own module doc per the
directory-per-module convention. Runner mechanics (tracking collection,
ordering validation, batch-rollback-on-failure) live in
[modules/infrastructure.md](infrastructure.md#migration-runnerjs).

## One fact worth repeating here

Migrations do **not** auto-apply on `npm start` — this is deliberate (see
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md)). Some migrations here are
one-time, potentially-lossy data repairs with a documented, deliberately
irreversible `down()` (003, 007, 008) — read a migration's own header
comment before assuming `down()` is safe to run.
