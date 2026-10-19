# CHANGE-RECIPES

Step-by-step file sequences for common changes. Each recipe: numbered steps,
exact file paths/patterns, and a "verify with" line. Verified against commit
`f0bdc1d`, 2026-09-23.

## add-endpoint

1. **Validator** — `src/validators/<domain>.validator.js`: add a function
   (body/param rules, reuse `common.validator.js` helpers). Export it.
2. **Service** — the owning `src/services/**/*.service.js`: add the method.
   Load/validate the target doc (`NotFoundError` if missing); persist via
   the repository, preferring an atomic conditional update
   (`findOneAndUpdate` with a guard clause) over read-then-write if two
   concurrent callers could race — see `CompetitionRepository.startAgeGroup`
   for the pattern. Log via the injected `logger`. Emit a socket event only
   if you've confirmed the target room actually has members (see
   [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md) — several existing
   emitters broadcast into empty rooms; don't copy that pattern blind).
3. **Repository** (only if needed) — `src/repositories/*.repository.js`:
   add a method only if `BaseRepository`'s generic CRUD can't already do it.
4. **Controller** — `src/controllers/<domain>.controller.js`: thin handler,
   `asyncHandler`-wrapped — parse params, call the service, shape
   `{success, data, message}`.
5. **Route** — `src/routes/<domain>.routes.js`: register with the chain, in
   order: `authMiddleware` → role guard (`requireX`) →
   `validateCompetitionContext` (if competition-scoped and the id isn't
   already proven via a route param) → `requireUnlockedCompetition()` (if a
   write, unless identity/profile data) → validator chain →
   `handleValidationErrors` → an audit wrapper (`auditXxx`, see
   [11-OBSERVABILITY.md](11-OBSERVABILITY.md)) if it's a sensitive op →
   controller method. For a route whose competition id lives in a param,
   pass `requireUnlockedCompetition({param:'id'})` explicitly.
6. **OpenAPI** — `src/docs/openapi.js`: add the matching `add()`/`sa()`
   entry so `npm run docs:openapi:check` doesn't fail CI (see
   [05-API-SURFACE.md](05-API-SURFACE.md) for the coverage-parity check this
   enforces).
7. **DI + test harnesses** — a new controller is registered in
   `bootstrap.js` and resolved by the router at build time. Integration
   tests that hand-build a container (e.g.
   `tests/integration/admin-score-lock-cycle.test.js`) must stub it too, or
   Express throws "Route.post() requires a callback function" and the whole
   suite fails to load (hit on 2026-10-18 with `tieBreakDrawController`).
8. **Mirror on superadmin** if admins have it — `super-admin.routes.js`
   reuses the same handlers without `validateCompetitionContext`
   (competition id comes in the request).

**Verify with**: `npm run docs:openapi:check`; a unit test in
`tests/unit/routes/` mounting the router with a mocked `auth.middleware`
(pattern: `admin.routes.test.js`) to assert the auth chain; an integration
test in `tests/integration/` exercising the real DB path if it touches a
model.

## add-entity-field

1. **Model** — `src/models/<Entity>.js`: add the field, with its enum/
   default/`select:false` as appropriate. If it needs an index, declare it
   on the schema (`schema.index(...)`) rather than only building it in a
   migration, so `index-manager` doesn't report drift.
2. **Migration** (only if backfilling existing rows, or the index must
   exist before the schema change ships) — see `add-migration` below.
3. **Validator** — the relevant `*.validator.js`: add validation for the
   field wherever it's user-settable.
4. **Sanitization** — if it's a free-text field, add it to the relevant
   `sanitize*Data` function in `utils/validation/sanitization.util.js`.
5. **Projection allow-lists** — `utils/data/user-projection.util.js`: if the
   field carries PII or should/shouldn't be visible to a given role, update
   the relevant `*_FIELDS` constant. **Do not assume the schema `toJSON`
   transform protects it** — most reads are `.lean()` and never see that
   transform (see [04-DATA-MODEL.md](04-DATA-MODEL.md)).
6. **Service methods** that read/write the entity — update accordingly.

**Verify with**: a unit test asserting the field round-trips through the
model; if it's sensitive, a security test asserting it's absent from an
anonymous/cross-role response (pattern:
`tests/security/submitted-teams.security.test.js`).

## add-role-or-permission

1. **`src/middleware/auth.middleware.js`**: add a `requireX` guard (compose
   from `requireRole(...)` where possible), export it.
2. If the permission is competition-scoped, decide whether it follows
   `mayActOnCompetition` (admin-style — membership in `competitions[]`) or
   seat-based (judge-style — `judgeHoldsSeatAt`/`resolveAssignment`). Don't
   invent a third pattern without a strong reason — see
   [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).
3. Wire the guard into the relevant route(s).
4. If it's a new panel role (judge-side), add it to `Judge.judgeType`'s enum,
   and to `JUDGE_PUBLIC_FIELDS`/`JUDGE_ROLE_MAP`
   (`utils/scoring/judge-slip.util.js`) if it participates in scoring.

**Verify with**: `tests/security/competition-scope.security.test.js`-style
coverage — assert both the positive (permitted) and negative (refused) case
through the real router, not just the guard function in isolation.

## add-socket-event

1. **`src/socket/events/event-types.js`**: add the constant.
2. **Handler** — `src/socket/handlers/<x>.handler.js` (or a new handler
   file, registered in `bootstrap.js`'s `initializeSocketIO`): add the
   listener/emitter.
3. **Room targeting**: if it's scoring-related, use
   `scoringRoomIds`/`getAltRoomId` (`utils/data/scoring-room.util.js`) —
   never a hand-rolled room-id string. If it's not scoring-related, **verify
   a join mechanism exists for the room you're targeting** — today only
   scoring rooms and `competition_{id}` have one; `emitToUser` is the
   reliable alternative for anything else (see
   [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md)).
4. If authorization is needed beyond "is this socket a judge," check
   `socketManager.isJudgeAuthorizedForRoom`/`cacheJudgeAssignments` rather
   than re-deriving it. For "does this person hold seat X in this room",
   read `socket.judgeTypesByRoom.get(roomId)` (a Set of every seat) — not
   `judgeTypeByRoom`, which keeps only one. `handleTimeRecord` (Time Keeper
   only) is the pattern.
5. Register through `socketManager.registerEventHandler` — that wrapper is
   what records the per-event Prometheus metrics.

**Verify with**: `tests/security/socket-scoring.security.test.js` pattern —
a real Socket.IO client asserting the event only reaches authorized
sockets; `tests/integration/socket/scoring-socket.test.js` for an end-to-end
example.

## add-migration

1. Copy `src/migrations/migration-template.js` to
   `src/migrations/NNN_description.js` — next sequential number, **no
   gaps** (the runner validates this and refuses to run otherwise).
2. Export `up`/`down`. If it's an **index-only** migration, prefer also
   declaring the index on the model schema so it stops showing as
   `undeclared` drift on future `index-manager` reconciliations.
3. If it's a **data** migration, make `up` idempotent (skip rows that
   already look migrated — see 006/008's pattern in
   [04-DATA-MODEL.md](04-DATA-MODEL.md)) and decide explicitly whether
   `down` can be safely reversible or must be a documented no-op (say so in
   a comment).
4. Test locally: `npm run migrate:status`, `npm run migrate:up`, `npm run
   migrate:down` (or `npm run prepare:db` for the full `--migrate --no-serve`
   path).

**Verify with**: `npm run migrate:status` shows it applied; a test under
`tests/unit/infrastructure/database/` if the migration's ordering/behavior
is itself the thing being protected (pattern: `migration-runner.test.js`).

## add-config-env-var

1. **`src/config/config-manager.js`**: add it inside `load()` using the
   right typed getter (`getString`/`getNumber`/`getBoolean`/`getArray`/
   `getRequired`), under the right config block.
2. Add validation in `validate()` if it has constraints (range, cross-field
   dependency like the discount-code pair).
3. Add a row to [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md) (name only,
   never a value).
4. Add it to `.env_example`.
5. If it affects production deploy behavior, add it to `render.yaml`
   (`sync: false` if sensitive or incident-actionable — see
   [15-DEPLOYMENT.md](15-DEPLOYMENT.md) for when to choose `sync:false` vs.
   a static `value:`).

**Verify with**: `npm run env:check` (diffs `.env`/`.env.production`
against `.env_example`); `node scripts/startup.js --check` to confirm the
startup report reflects it.

## add-validator-rule

1. Add the rule to the relevant `*.validator.js`, composing from
   `common.validator.js` where possible — check
   [modules/validators.md](modules/validators.md) for what's already
   available before writing a bespoke chain.
2. Attach `handleValidationErrors` after the chain on the route (or use the
   route's local `validate()` wrapper if it has one — `team.routes.js` is
   the one file with its own).

**Verify with**: `tests/unit/validation-middleware.test.js`-style unit test,
or a route-level test asserting a 400 with the expected `error.details` key
(see [02-CONVENTIONS.md](02-CONVENTIONS.md) for the `err.path`-not-`err.param`
gotcha in multi-field validation errors).

## add-cached-read

1. In the owning service, wrap the read in `cacheService.wrap(key, fn,
   ttl)` — key convention: `<entity>:<id>` or `<entity>:<scope>:<id>:<hash
   of options>` (see `team.service.js`/`competition.service.js` for
   examples).
2. Add `cacheService.delete(key)`/`deletePattern('<entity>:*')` to every
   write path that could change the cached value.
3. Don't assume the cache is shared across instances — it's an in-memory
   `Map`, process-local (see [10-CACHING-AND-PERF.md](10-CACHING-AND-PERF.md)).

**Verify with**: a unit test asserting a second call within the TTL doesn't
hit the repository mock again; a test asserting invalidation after the
corresponding write.

## add-background-script

1. Put it in `Server/scripts/`, not `src/`.
2. If it writes to the database, default to dry-run and require an explicit
   `--commit`/`--force` flag to actually write — the established pattern
   (`resetScores.js`, `syncDatabase.js`).
3. If it's part of the seed chain, wire it through
   `scripts/lib/setup-chain.js` for the shared locking/`--drop`/verification
   handling rather than reimplementing it.
4. If it's a perf script, point it at `PERF_MONGODB_URI` and follow
   `seedScale.js`'s refusal-check pattern against accidentally targeting the
   real database.
5. Add the npm alias to `package.json`'s `scripts` block, and a row to
   [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md).

**Verify with**: run with the dry-run/default flags first; `npm run
setup:list`/`setup:dry` if it joins the main seed chain.

## add-tests-for-a-layer

See [14-TESTING.md](14-TESTING.md#writing-a-test-for-a-given-layer) for the
per-layer pattern (unit service/util, unit route-guard, integration,
security, socket) and which existing file to extend vs. when to create a
new one.
