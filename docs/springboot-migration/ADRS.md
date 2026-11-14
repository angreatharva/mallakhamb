# Architecture Decision Records

Status values: **Accepted** (decided by the owner), **Proposed** (this plan's
recommendation, accepted when the owner approves the plan), **Superseded**.

---

## ADR-001: Modular monolith, not microservices {#adr-001}
**Status:** Proposed · 2026-11-12

**Context.** One Node process serves 220 operations and Socket.IO today. One
VM is active at a time. The busiest request (a judge's slip) crosses scoring,
panel, competition and realtime in one call.

**Options.** (a) A modular monolith. (b) Services per bounded context
(identity, registration and payment, scoring and results). (c) A straight
layered port of the Node structure.

**Decision.** (a): one Spring Boot app with package-by-feature modules,
explicit `api` packages, and ArchUnit-enforced boundaries.

**Why.** (b) adds network hops, distributed failure modes and deployment units
on 4 GB VMs, for a load of tens of concurrent users. (c) would carry over the
god services and the hidden coupling (01 §8).

**Consequences.** One deployable and one JVM. Modules can be split later along
the `api` seams if a real need appears. Boundaries depend on ArchUnit
discipline.

---

## ADR-002: Keep MongoDB; MongoTemplate for the two hard aggregates {#adr-002}
**Status:** Accepted (owner, 2026-09-07)

**Context.** Entries live in `Competition.registeredTeams[]`; judge slips live
two levels deep in `Score.playerScores[].judgeSlips[]`. Production data is
already in this shape on a self-hosted replica set.

**Decision.** Spring Data MongoDB. Derived repositories for simple
collections. `MongoTemplate` adapters (`CompetitionEntriesStore`,
`ScoreSheetStore`) with hand-written aggregations, team-addressed
`arrayFilters` updates and the `__v`-guarded merge-and-retry loop.

**Consequences.** No data migration, and rollback to Node stays possible. The
two adapters are the riskiest code, so they get dedicated builders and real-Mongo tests.

---

## ADR-003: Socket.IO protocol in Java with socketio4j/netty-socketio {#adr-003}
**Status:** Proposed · 2026-11-12

**Context.** 9 Web screens use `socket.io-client` 4.7 (no acks, binary or
namespaces). Judges use these screens live on meet day.

**Options.** (A) netty-socketio (socketio4j fork, or the original mrniko);
(B) Spring WebSocket + STOMP with a client rewrite; (C) keep a Node Socket.IO
process. Full comparison in 03 §2.

**Decision.** (A), the **socketio4j** fork: maintained, Netty 4.2, has a
Spring Boot starter. Isolated behind `RealtimePublisher` and the
`realtime.socketio` package.

**Why.** Zero client change on the highest-risk screens; a narrow feature set
to cover; checked by the Stage-2 spike (S1–S14).

**Consequences.** A second listening port (Netty), proxied by Caddy. A smaller
community than Spring's own stack. Exit ramp to STOMP is contained to one
package plus 9 Web files.

---

## ADR-004: Mongoose compatibility on every write {#adr-004}
**Status:** Proposed · 2026-11-12

**Context.** The Node ops scripts keep writing with Mongoose (ADR-009), and
rollback to Node must work at any point before Node is retired.

**Decision.** Map `__v` as a plain field (not Spring `@Version`); set
`createdAt` and `updatedAt` explicitly on every write path; keep Mongoose's
enum strings, Map and Mixed shapes and ObjectId types; round-trip test against
Node-seeded data.

**Why.** `@Version` uses a different mechanism and would create a second
version field. Missing timestamps or `__v` would break Node reads and the
`Score` concurrency guard.

**Consequences.** Some boilerplate in `MongooseCompat`; no Spring auditing annotations.

---

## ADR-005: Keep the existing auth contract (JWT HS256, cookies + Bearer, own CSRF) {#adr-005}
**Status:** Proposed · 2026-11-12

**Context.** The browser, iPhones without cookies, and tokens already in
circulation depend on exact claims, cookie attributes, the signed CSRF header,
refresh-family rotation, and the error codes and messages.

**Decision.** Spring Security for the filter chain and method guards only.
Its session management and CSRF are off. JWT through jjwt with the exact Node
claims. The project's own CSRF filter, ported. BCrypt verifies existing hashes.

**Why.** Spring's resource-server and CSRF defaults implement different
contracts. Matching them would change the frontend.

**Consequences.** More custom security code to review, covered by the ported
security suites and the twin-run corpus. Changing to standard Spring
mechanisms later is a separate, approved project.

---

## ADR-006: No Redis, no broker: single active instance {#adr-006}
**Status:** Proposed · 2026-11-12

**Context.** Production runs one active API (with a warm standby promoted by
`mallakhamb-role`). Node supports Redis for token invalidation, but production
doesn't set `REDIS_URL`. Durable logouts already live in Mongo
(`SessionRevocation`).

**Decision.** Caffeine for caches; Mongo for revocations; an in-memory
Socket.IO store; in-memory Bucket4j limiters. No Redis, Redisson, Hazelcast or
Kafka.

**Why.** YAGNI: there is no second instance to coordinate with. On failover,
sockets reconnect to the new active and rebuild their room membership at
handshake.

**Consequences.** Rate-limit counters and caches reset on failover (as today).
If two active instances are ever needed, add a Socket.IO store and a shared
limiter store behind the existing interfaces, and write a new ADR first.

---

## ADR-007: One cutover with instant rollback, not a route-by-route strangler {#adr-007}
**Status:** Proposed · 2026-11-12

**Context.** Most write paths broadcast over Socket.IO to clients connected to
**that** process. Splitting routes between Node and Java would need a
cross-process event bridge (or Redis) so that a Java write reaches sockets on
Node, and would also put two schedulers and two lock checks on one database.

**Options.** (a) Route-by-route strangler through Caddy. (b) Full parallel
build, verified by differential replay, then one switch with rollback.

**Decision.** (b). The switch and rollback reuse the existing planned-failover
mechanism (`mallakhamb-role takeover`, ≈ 5–8 s).

**Why.** The differential harness gives the confidence a strangler would give,
without running two backends in production. Rollback is one command because
the database is shared and unchanged.

**Consequences.** One big switch, de-risked by 14 days on staging, drills and
the ±7-day meet rule. Migrations stay additive until Node is retired.

---

## ADR-008: Java continues the existing migration log; schemas own indexes {#adr-008}
**Status:** Proposed · 2026-11-12

**Context.** Node migrations 001–016 are applied everywhere and tracked in the
`migrations` collection. Indexes are reconciled from schema declarations at
startup.

**Options.** Mongock; Flyway-for-Mongo forks; a small runner of our own.

**Decision.** A small `MigrationRunner` (≈ 150 lines) that reads and writes
the **same** `migrations` collection and never re-runs a Node migration.
**Node owns migrations until cutover** (Node bug fixes may still add one);
Java adds none before it. After cutover Java numbers new migrations from the
highest applied id, and refuses to start if the log holds an id it doesn't
know. Plus `IndexReconciler`, a port of `index-manager.js` (report
conflicts, never auto-drop). Run only in the `prepare-db` release step, never
per instance.

**Why.** Mongock would start its own changelog collection, so the history
would be split in two. The needed feature set is tiny.

**Consequences.** We own ~300 lines of infrastructure code with tests.

---

## ADR-009: The ops scripts stay on Node, with a schema freeze {#adr-009}
**Status:** Proposed · 2026-11-12

**Context.** 24 scripts in `Server/scripts` use Mongoose directly (seed
chains, demo seed, panel seating, score seeding, backups helpers, perf
harness). They are run by people and by the OCI e2e lifecycle.

**Decision.** They keep running on Node, with the Mongoose models kept in
`Server/src/models`. **Any schema change after Stage 1 is made in both the
Mongoose model and the Java document in the same PR**, checked by the
Mongoose-compatibility round-trip test in CI.

**Why.** Porting 24 operational scripts adds no user value and risks the setup
chains everyone depends on.

**Consequences.** Two schema definitions for a while. Revisit after Node is
retired (05 §8): either port the scripts to call the API, or keep the models.

---

## ADR-010: Java 25 LTS + Spring Boot 4.1.2 + Gradle, war, servlet stack with virtual threads {#adr-010}
**Status:** Proposed · 2026-11-12

**Context.** 1 OCPU / 4 GB VMs; a blocking Mongo driver; request/response
code; an expected life of many years.

**Decision.** Temurin 25 LTS, Spring Boot 4.1.2 (owner's Initializr setup, 2026-11-14: Gradle – Groovy, Java, War, YAML, Java 25), Spring MVC on embedded Tomcat with
virtual threads, **Gradle 9 with the Groovy DSL** (owner's choice,
2026-11-14): subprojects `:kernel`, `:engines`, `:app`, `:tools`, a
convention plugin, one version catalog, dependency locking and verification. The war is run with `java -jar` (embedded Tomcat); external-container deployment is out of scope. Fallback to Boot 4.0.x only if the Stage-2 spike finds a
library that breaks on 4.1.

**Why.** Longest support window; compact object headers lower memory use;
virtual threads give concurrency without rewriting everything as reactive
code; no pinning on `synchronized` since JDK 24. Gradle subprojects make the
purity of the kernel and engines a compile-time fact, and the shared build
cache helps parallel worktrees.

**Consequences.** Newer stack, so less community material than Boot 3. The
spike checks the dependencies before any module work starts. War packaging
adds a `ServletInitializer` and a `providedRuntime` Tomcat dependency, and
nothing else changes for a `java -jar` deployment.

---

## ADR-011: Generate the mechanical code; models write only business logic, checked by tools {#adr-011}
**Status:** Proposed · 2026-11-12

**Context.** 220 operations, ~25 agent sessions, an owner who wants uniform,
correct code at low token cost. Prompts alone don't keep many sessions
consistent, and reading the Node god services whole costs a lot of tokens.

**Options.** (a) Agents port module by module from the Node sources, guided
by prompts. (b) Generators for every mechanical part, per-operation context
packs, a fixed recipe set and an exemplar, with a tool-run check loop
deciding "done". (c) Fully automatic translation (a transpiler or one-shot
LLM translation of whole files).

**Decision.** (b), detailed in 07.

**Why.** (a) costs the most tokens and drifts in style. (c) would carry over
the Node structure and debt (01 §8) and still needs the same verification.
(b) makes the cheap things free, the risky things small, and correctness a
tool's verdict.

**Consequences.** About a week of tooling (Stage 1–2) before porting starts.
The kit becomes a maintained asset: when a unit fails for a kit reason, the
kit gets fixed, not just the unit.

---

## ADR-012: A shared kernel and generated catalogues: one definition per concept {#adr-012}
**Status:** Proposed · 2026-11-12

**Context.** Node defines its vocabulary many times over: 77 enum fields with
drifting lists, hundreds of repeated literals, 49 role checks by string, 65
status literals, 24 rounding sites, 229 clock reads, an incomplete error-code
file (08 §1). Defects like HIGH-3 and the `competition:` room bug came from
exactly this.

**Decision.** A pure `kernel` package (`WireEnum`s with behaviour and named
subsets, typed ids, value objects) plus generated catalogues in `platform`
(`ErrorCode` with status, `MessageKey` + `messages.properties`, sealed
`RealtimeMessage`s, `Rooms`, `*Fields`, `ApiRoutes`, cookie, header, cache,
limiter, metric, audit and email catalogues, `AppProperties`). Wire and stored
values stay byte-identical to Node. Enforced by the single-source tests
(04 §6a).

**Why.** Changing a concept becomes one edit, with the compiler and the tests
naming every affected place. The model can't invent a string, because the
skeletons and the checks don't allow one.

**Consequences.** The kernel has to be designed and frozen before modules
start (Stage 2), so it is on the critical path. More types up front; much less
code at call sites. The Web app can later consume the same vocabulary (08 §15).

---

## ADR-013: Capabilities in one access matrix {#adr-013}
**Status:** Proposed · 2026-11-12

**Context.** Node guards are per-route middleware plus string checks on
`userType`/`role` inside services; seat checks are separate.

**Decision.** `@Requires(Capability.X)` on every route; one `AccessMatrix`
maps capabilities to roles and judge seats. The initial matrix is generated
from Node's guard chains, and a manifest test proves equivalence. Ownership
stays in the services, through shared `Ownership` predicates.

**Why.** Who may do what is answered in one file; adding a role or moving a
permission is one edit with a test listing every affected route. It's not a
general permission system (YAGNI): there are no stored or per-user grants.

**Consequences.** Capability names need a careful first pass by the lead
(the generator proposes them from the routes they cover).

---

## ADR-014: User-facing text in one message bundle {#adr-014}
**Status:** Proposed · 2026-11-12

**Context.** The frontend matches on message substrings, so messages are part
of the contract. Node has them inline across services, validators and
middleware.

**Decision.** Every message lives once in `messages.properties` (exact Node
text) behind a generated `MessageKey`, resolved by `MessageSource`.

**Why.** One place to review or change text; typos impossible; ready for
other languages later without touching code.

**Consequences.** Messages with values use `{0}` placeholders, rendered to
the exact Node output (pinned by the twin-run). Changing a message is
deliberately visible to the contract tests.

---

## ADR-015: The COP as versioned rulebook data; a reader skill proposes new editions {#adr-015}
**Status:** Proposed · 2026-11-13

**Context.** The owner wants the software to adapt quickly when the Code of
Points changes. Today the COP is hard-coded twice (server and Web), one
edition for every competition, mixed with code. `Competition.editionRef`
exists but nothing reads it.

**Options.** (a) Keep rules in code; change code per COP. (b) Rules as
versioned data read by the engines, with procedures as a closed set of named
strategies, plus a PDF-reading tool that drafts the next edition for human
approval. (c) A rule language or scripting inside the data. (d) Let a model
interpret the COP at runtime.

**Decision.** (b). Rulebook files per edition, engines parameterised by
`Rulebook`, competitions pinned to an edition, editions immutable. The reader
is a Claude **skill run outside the app** that outputs a draft and a change
report with page-and-quote evidence; a person approves; it lands as a pull
request.

**Why.** (a) is today's cost. (c) makes rules untestable and able to produce
any score. (d) puts a non-deterministic system in the scoring path, which is
unacceptable for results. (b) makes most COP changes a data change with
tests from the COP's own worked examples, and keeps a human between the PDF
and the scores.

**Consequences.** A genuinely new kind of rule still needs a small code
change (a new named strategy); the reader says so explicitly. The runtime
part is built with the engines in Stage 3; the reader, Web table generation
and edition selection come after cutover. An in-app upload for officials
(needs a model API key and a superadmin-only screen) is possible later on the
same pipeline; not built unless the owner asks.
