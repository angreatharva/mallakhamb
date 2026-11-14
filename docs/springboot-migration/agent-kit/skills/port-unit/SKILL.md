---
name: port-unit
description: Port one Node operation (by operationId) or one cluster of operations to the Spring Boot backend in backend/, from its context pack, until portCheck is green. Use when asked to port a route, a unit, an operationId, or the next units of a module in the Mallakhamb Spring Boot migration.
---

# Port one unit to Spring Boot

You are filling in **generated** Java skeletons so they behave exactly like the
Node code in the context pack. The behaviour is already decided by Node;
don't improve it, don't redesign it, don't add features.

## Inputs (read these, and only these)

1. `backend/CONVENTIONS.md` and `backend/RECIPES.md` (once per session).
2. The pack: `backend/.port/packs/<operationId>.md`. If it's missing, run
   `node backend/tools/node/context-pack <operationId>`.
3. The Java files the pack lists under "Edit these". Open other files only
   when `portCheck` names them.

Never open whole Node services; the pack already has the reached functions
with `file:line`. If something the logic needs is genuinely missing from the
pack, write it in the unit file as `pack-gap: …` (it's a kit bug) and read
only that function.

## Steps

1. Read the unit state `backend/.port/units/<operationId>.json`. If `status`
   is `green` or `accepted`, stop. If `attempts >= 3`, stop and report the
   blocker.
2. Implement the use-case method in its **scaffold** (the application-service
   method that throws `NotPortedException`), following the recipe(s) tagged in
   the pack. Match `backend/app/src/main/java/com/mallakhamb/modules/team` (the
   exemplar) for structure and style, and `CompetitionEntriesStore` /
   `ScoreSheetStore` for P4 / P5.
3. Rules that are **not negotiable**:
   - **One definition per concept** (`backend/CONVENTIONS.md` §1): kernel enums,
     typed ids, value objects, `ErrorCode` + `MessageKey`, `RealtimeMessage`
     records, `Rooms`, `*Fields`, `ApiRoutes`, `Capability`, `AppProperties`,
     the injected `Clock`. **No string, number or status literal for any of these.**
     If a concept you need is missing from its catalogue, don't create it
     locally: record `needs-lead: add <concept> to <catalogue>` and stop the unit.
   - Response fields come from the generated response record. Never add a field.
   - Rounding only through `JsNumber`. COP numbers, tables and wording only through the competition's `Rulebook` (09) and the engines.
   - Branch on enums with exhaustive `switch` (no `default`), or use the enum's own method.
   - State changes only through the enum's `canMoveTo`.
   - Writes to `registeredTeams` or `Score` only through `CompetitionEntriesStore` / `ScoreSheetStore`.
   - Publish realtime events only after the write succeeds, through `RealtimePublisher`, using `Rooms`.
   - Don't edit owned generated files (marked `GENERATED`), another module's packages, or `platform/`. If you need a change there, record `needs-lead: …` and stop.
   - Keep each edit small; don't rewrite whole files.
4. Run `./gradlew portCheck --op=<operationId> --quick` while iterating, and
   `./gradlew portCheck --op=<operationId>` to finish (`gradlew.bat` on Windows;
   run from `backend/`).
5. Fix only what the report names. **At most 3 full cycles.** After the third
   red run, stop.
6. Update the unit file: `status` (`green` | `blocked`), `attempts`, `recipes`,
   and one line of `notes` (a non-obvious decision or the blocker).
7. Move to the next unit in the order the lead gave, or stop if none.

## Report (keep it short)

One line per unit: `<operationId>: green | blocked (<reason>)`. No code in
the report; the diff is in git.
