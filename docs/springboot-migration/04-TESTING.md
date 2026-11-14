# 04 — Testing and verification

The Node backend is the **specification**. It has 901 passing tests, a
generated OpenAPI contract, black-box harnesses, and months of fixed defects
pinned by tests. The Java backend is accepted when it behaves the same on
everything those tools can observe. So the main gate is not a new test suite
written from scratch; it is **comparing the two backends directly**.

```mermaid
flowchart LR
  subgraph Gates, in order
    G1[Engine golden vectors<br/>bit-identical] --> G2[Java unit + integration<br/>JUnit, Testcontainers]
    G2 --> G3[Differential HTTP replay<br/>Node vs Java, same DB snapshot]
    G3 --> G4[Socket contract<br/>real socket.io-client]
    G4 --> G5[Existing black-box suites<br/>pointed at Java]
    G5 --> G6[Load + soak + failover<br/>on the OCI standby VM]
    G6 --> G7[Owner walk-through<br/>real devices]
  end
```

## 1. Test parity ledger

Every Node test file (112 today: `tests/unit` 32+, `tests/integration` 26+,
`tests/security` 16, socket, middleware, models, infrastructure) gets a row in
`backend/TEST-LEDGER.md`:

| Node test | What it pins | Java test(s) | Status |
|---|---|---|---|
| `tests/unit/v2-scoring.test.js` | COP worked examples, 8.10 tolerance, 9.225 base, C→B→A, tie-breaks | `ScoreCalculatorGoldenTest`, `TieBreakerGoldenTest` | … |

A module isn't done until each of its Node tests has a Java counterpart (or a
written reason it doesn't apply, for example Mongoose-only behaviour). The
`test.failing` markers (verified-but-unfixed defects) are ported as tests that
**assert the current behaviour**, with the same note, so fixing them stays a
deliberate act.

## 2. Differential HTTP testing (the main gate)

**Tool:** `backend/tools/node/twinrun/` (Node, so it can reuse the existing seed
chain and fixtures):

1. Restore the same database snapshot into two databases (`twin_node`,
   `twin_java`) on a local single-node replica set.
2. Start Node on `:5000` against `twin_node` and Java on `:8080` against
   `twin_java`, with the same `JWT_SECRET`, the same discount code, email
   provider `none`, and **clocks started at the same instant**: Java through
   its `Clock` bean, Node through a preload (`-r twinrun/clock.js`) that
   installs `@sinonjs/fake-timers` with `toFake: ['Date']` and
   `shouldAdvanceTime: true`. Only `Date` is faked: faking timers deadlocks
   the Mongo driver (known gotcha). `Server/` code is not changed.
3. Replay a **corpus** of requests against both, in order, with matching
   identities (each persona logs in on both sides).
4. Compare: status code, the headers that matter (`Set-Cookie` attributes,
   `X-New-Token` present or absent, `ETag`, `Content-Type`), and the JSON body
   after **normalising only**: generated ObjectIds (mapped by first appearance),
   timestamps within the frozen clock, JWT strings (decoded and claims compared
   instead), correlation ids.
5. **Random by design → compared by invariant, not equality**
   (`twinrun/invariants.yml`): lot draws (`crypto.randomInt`, a valid
   permutation of the same teams), OTP and account-request codes (6 digits,
   stored hash verifies), refresh tokens and CSRF tokens (format, and accepted
   on the next request of the same side), bcrypt hashes (each side's hash
   verifies the same password), correlation ids, retry jitter.
6. After each write request, **diff the two databases** (the touched
   collections, documents normalised the same way). This catches a Java write
   that returns the right response but stores a different shape: missing
   `__v`, missing `updatedAt`, a number stored as a string, a Map with a
   different key, an array element added in the wrong place.

**Corpus sources**, all recorded from Node in Stage 1:

| Source | Size | Covers |
|---|---|---|
| `scripts/perf/testApi.js` | 112 checks in competition order | the main flows |
| `npm run setup:api` (`setupApi.js` → `seedApi.js` → `payWithDiscount.js`) | 20 meets, 20 teams, 224 athletes, 51 judges | registration, payment, panel seating at volume |
| `meetDay.js` (scripted, not random, for replay) | a simulated meet day | judge polls, slips, Scorer saves, locks, running order |
| Generated from `openapi.json` | ≥ 1 request per operation per declared response code (401/403/404/400/423 included) | the whole surface, including error paths |
| Hand-written security cases | every `tests/security` scenario as raw requests | authz and PII |

`API-MATRIX.md` *Status* turns `Diff-green` when every corpus entry for that
operation matches. **Gate for Stage 4: 220/220 `Diff-green`.**

**Spec check:** SpringDoc's generated spec is normalised and compared with
`Server/docs/openapi.json` in CI (paths, methods, parameters, security). Any
operation present in one and missing from the other fails the build. This is
the Java twin of `docs:openapi:check`.

**Allowed differences** live in `twinrun/allowed-diffs.yml`, each with a
reason and an owner approval date. Expected entries: the 3 dead-route cases
from 01 §8 T11 if behaviour is intentionally kept, `server`/`x-powered-by`
headers. The file starts empty and is reviewed at every gate.

## 3. Engines: golden vectors (bit-identical)

The six engines are pure, so they are tested by **running the JS engine and
the Java engine on the same inputs**:

1. `backend/tools/node/golden/generate.js` (its own `package.json` with fast-check; `Server/` is untouched) imports the real Node modules
   (`calculation.util`, `tie-breaker.util`, `ranking.util`,
   `team-championship.util`, `payment.config`, `panel-plan`, the eligibility
   utils, the lot draw with a seeded RNG) and writes JSONL files of
   `{input, output}`:
   - every worked example from `v2-scoring.test.js` and the COP PDF,
   - **≥ 100,000 property-generated cases per engine** (fast-check, fixed seed): marks on the 0.05/0.1 grids, panels of 3/4/5, edge tolerances, ties at every step of the cascade, negative deductions, missing slips, time strings `"1:05"` / `"65"` / `""`,
   - fee cases around every UTC day boundary and phase edge.
2. `GoldenVectorTest` (JUnit, parameterised) runs the Java engine on each
   input and requires **exact equality** of every number (compared as the
   JS-rendered string, so `8.1` vs `8.100000000000001` fails) and every string.
3. The vectors are committed **per COP edition** (`golden/cop-2022-11/…`).
   Regenerating them after a Node change shows exactly which outputs changed.
   A future edition gets its own set, generated from the Java engines once its
   rulebook is approved and its PDF worked examples pass (09 §3).

**Numeric parity rules** (in one helper, `engines.scoring.JsNumber`; nothing
else in the codebase rounds):

- Keep `double` arithmetic in the **same order** as the JS code (floating-point addition is not associative; sum in the same loop order).
- `x.toFixed(n)` → `new BigDecimal(x).setScale(n, RoundingMode.HALF_UP).toPlainString()`. This works because `new BigDecimal(double)` is the exact binary value, and JS `toFixed` picks the nearest, with ties going up for positives, on that exact value. Negative inputs and `-0` are pinned by vectors.
- `Math.round(x)` → Java's `Math.round(double)`, which matches JS for finite values (both round .5 toward +∞, and both handle 0.49999999999999994 correctly; `Math.floor(x + 0.5)` does **not**). Results that must be `-0` or NaN are pinned by vectors.
- `parseFloat(toFixed(...))` round-trips go through `Double.parseDouble` of the same string.
- Execution "half-down to 0.1" is whatever the JS does, reproduced and vector-tested, not re-derived from the rule text.
- Sorting: JS `Array.prototype.sort` is stable; use `List.sort` (stable) with the same comparator, including the comparator's tie fallbacks.

## 4. Java unit and integration tests

| Layer | Tooling | Notes |
|---|---|---|
| Domain and engines | JUnit + AssertJ | Golden vectors + readable example tests named after the rule ("4 judges: average of the middle two") |
| Application services | JUnit + Mockito only at **ports** (clock, email, payment gateway, OCR, publisher) | No mocking of repositories for the two hard aggregates; those are tested against real Mongo |
| Mongo adapters | Testcontainers MongoDB **as a replica set** (transactions and change behaviour match OCI) | One reusable container per worktree (`testcontainers.reuse.enable`), a database per test class |
| Web layer | `MockMvc` / `RestTestClient` over the full filter chain | Guards, CSRF, cookies, envelope, 423, rate limits |
| Concurrency | Real Mongo, 6 judges × 50 athletes × 3 apparatus saving at once | No lost slips, no duplicate Score docs, the retry bound holds |
| Mongoose compatibility | Seed with the **Node** seed chain into a container, then read every collection through the Java mappings and write it back unchanged: zero diff | Catches mapping drift (ADR-009) |
| AES-GCM, bcrypt, OTP hashes, CSRF signatures, JWTs | Fixtures generated by Node | Java must verify and decrypt Node output, and Node must accept Java output (JWTs and CSRF tokens both ways) |

Migrations are not unit-tested in Java (Java doesn't run 001–016). New
migrations (017+) each get a test on a fixture from the previous state.

## 5. Real-time tests

- **Socket contract tests** run the **real `socket.io-client` 4.7** (from `Web/node_modules`) against the Java server from Node scripts in `backend/tools/node/socket-contract/`, replaying the Stage-1 recordings: connect (token, cookie, bad origin, expired, logged out, inactive), auto-join payloads, join and leave authorization, cross-judge forgery attempts (HIGH-5), Senior Judge override refusal, Time Keeper only, lock re-check, fan-out excluding the sender, once-per-socket for running order, twice for the two-form scoring events (§5 of 03), payload byte-equality after normalisation.
- **Reconnection:** kill and restart the Java process; every client reconnects and re-joins (the screens re-emit `join_scoring_room` on `connect`).
- **Port of `tests/integration/socket/scoring-socket.test.js` and `tests/security/socket-scoring.security.test.js`** scenarios one to one.
- **Load:** `scripts/perf/socketLoad.js --panels=12 --slips=40` against both backends; report connect time, fan-out p50/p95/p99, throughput.
- **Multi-instance:** not tested. Only one instance runs (ADR-006). The test is written if and when that changes.

## 6. Architecture tests (ArchUnit)

Only rules that protect real boundaries:

1. `:kernel` and `:engines` are separate Gradle subprojects, so Spring, Mongo, Jackson and Netty are **not on their classpath** (compile-time). ArchUnit adds: `..engines..` and `..kernel..` don't depend on `com.fasterxml..`, `tools.jackson..` (in case a transitive leak appears).
2. `..domain..` packages likewise.
3. Classes in `modules.X..` access `modules.Y..` only through `modules.Y.api..`.
4. No cycles between `modules.*` slices.
5. Only `realtime.socketio..` imports the Socket.IO library.
6. No `@Document` type appears in a `@RestController` method signature or in a `..web.dto..` record field.
7. Controllers don't depend on `MongoTemplate` or repositories.
8. No field injection (`@Autowired` on fields).
9. `:kernel` depends on nothing but the JDK (enforced by Gradle: it has no dependencies).
10. No raw `ObjectId` in `application`/`domain`/`engines` signatures (typed ids only).
11. No `System.getenv`/`@Value` outside `platform.config`; no `Instant.now()`/`LocalDate.now()`/`System.currentTimeMillis()` outside `platform.time`; no `setScale`/`Math.round`/`%.nf` outside `JsNumber`; no `ResponseEntity.status(int)`/`HttpStatus.valueOf` outside `platform.web`.

## 6a. Single-source tests (08 §14)

| Test | Fails when |
|---|---|
| `SingleSourceTest` | any `WireEnum` wire value, event name, cookie or header name, room prefix, error code or `messages.properties` text appears as a string literal in `backend/src/main/java` outside `kernel` and generated files |
| `FieldPathLiteralTest` | a string literal is passed to `Criteria.where`, `Update.set/inc/push/pull` or `Aggregation.*` field arguments instead of a `*Fields` constant |
| Error Prone `MissingCasesInEnumSwitch` (error), `UnnecessaryDefaultInEnumSwitch` | a domain-enum `switch` is not exhaustive or hides new values behind `default` |
| `EnumWireParityTest` | a Java enum's wire values differ from the Mongoose `enumValues` it was generated from (re-run on every Node change) |
| `StateMachineTest` per stateful enum | a transition differs from the Node-derived table |
| `CatalogueCompletenessTest` | a code, status, message or event literal in `Server/src` has no catalogue entry (run by `gen-catalogues --check`) |
| `GeneratedFilesUnchangedTest` | a `GENERATED` file was hand-edited (hash check) |
| `RouteSecurityManifestTest` | any route admits different roles or seats than Node |
| `RulebookSchemaTest`, `RulebookSemanticTest` | any rulebook file breaks the schema or the semantic checks (ordered tiers, ceilings sum, every type has requirements, …) (09 §4) |
| `EditionImmutabilityTest` | a published rulebook file's hash changed |
| `EditionPinningTest` | adding a second edition changes any result of a competition pinned to the first |
| `RulebookParityTest` | `cop-2022-11.json` differs from what `gen-rule-data` produces from Node's tables |

## 7. The existing black-box suites, pointed at Java

| Suite | How it runs against Java |
|---|---|
| `npm run setup:api` and `setup:ui` chains | API URL env pointed at Java; `setup:ui` drives the real Web app in a browser against the Java API |
| `scripts/perf/testApi.js` (112 checks) | `--target` (added in Stage 1 if missing) |
| OCI nightly e2e lifecycle (`mallakhamb-e2e`) | On staging after Stage 6: the e2e API unit runs the Java war; 4 runs/day for at least 2 weeks before cutover |
| `meetDay.js` | `--target=` Java on the standby VM |
| Web unit tests (Vitest) | Unchanged: they don't hit the backend |
| `Web` `copRulesSync.test.js` | Must pass against Java's `GET /api/public/cop-rules` |

## 8. Load, soak and failover (Stage 7, on the OCI VM shape)

| Test | Tool | Pass condition |
|---|---|---|
| Per-route latency | `benchmarkApi.js` against Node then Java, same snapshot, same VM | Java p95 and p99 ≤ Node on every benchmarked route; any exception explained and approved |
| Concurrency | `loadTest.js --concurrency=1,5,20` | Error rate equal; no 5xx |
| Meet day | `meetDay.js --panels=8 --spectators=200 --minutes=120` | p95 under the Node baseline; zero lost slips (DB check after) |
| Socket | `socketLoad.js`, and the 200-client reconnect storm | Fan-out p95 ≤ Node |
| Soak | `meetDay.js` for 8 h | RSS flat after warm-up; no GC pauses > 200 ms; RSS ≤ budget (05 §2) |
| Failover | Hard-stop the active VM during `meetDay.js` | Standby promotes (≈ 4 min automatic, ≈ 5–8 s planned) and judges reconnect with no lost saved slips, as with Node |
| Rollback drill | Run Java, write, switch to Node, read, write, switch back | No errors either way; DB diff shows only expected fields |

## 9. Security verification

- Port all 16 `tests/security` suites (they are the regression list from two audits).
- A PII contract test **per response DTO**: a forbidden-field list per persona (anonymous, judge, coach, player, admin) checked against every corpus response. Assert `status == 200` and a non-empty payload **first** (an endpoint that 500s otherwise passes as "not leaking").
- `osv-scanner`/OWASP dependency-check in CI (fails on high or critical); ZAP baseline against staging; the Spring Security filter-chain order checked by a test that lists the chain.
- A manual authz review: each row of `API-MATRIX.md` against its Node guard chain in `*.routes.js`.

## 10. Owner acceptance

Before cutover, the owner (or someone they choose) walks the per-role guides in
`docs/roles/` on **real devices** (judge tablets, an iPhone with cookies
blocked, a laptop) against Java staging, and signs off in
`backend/MIGRATION-STATUS.md`.
