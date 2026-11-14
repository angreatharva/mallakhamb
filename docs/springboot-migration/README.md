# Spring Boot Migration Plan — Mallakhamb backend

**Status:** plan only, **revision 4** (2026-11-14, against master `e364596`).
Revision 4 is a full review (32 fixes, see [REVIEW-2026-11-14.md](REVIEW-2026-11-14.md))
and the switch from Maven to **Gradle**. The project setup is the owner's
Spring Initializr choice: **Gradle – Groovy, Java, Spring Boot 4.1.2, War,
YAML, Java 25** (group `com.mallakhamb`).
Revision 3 adds the **COP rulebook engine** ([09](09-COP-RULEBOOK-ENGINE.md)):
the Code of Points becomes versioned data the engines read, and a skill reads
a new COP PDF and proposes the next edition for a person to approve.
Revision 2 makes **one definition per concept** the backbone of the design
([08](08-SINGLE-SOURCE-DESIGN.md)): the kernel and catalogues are generated
and frozen first (Stage 2), every generator and recipe uses them, and tests
stop literals from coming back. Revision 1 added the port kit
([07](07-CODEGEN-AND-AGENT-KIT.md)).
No migration code, CI, VM or deploy change happens before **21 Dec 2026**
(owner decision, 2026-11-12: the December meets on 12–13 and 19–20 Dec run on
the Node backend, and nothing shared changes until they are over).

## What this is

A plan to replace `Server/` (Node 24 + Express 4 + Mongoose 8 + Socket.IO 4)
with a Spring Boot backend. These stay the same:

- **The React app (`Web/`).** Its HTTP and Socket.IO contracts do not change.
  Any change the frontend has to make is listed in the compatibility matrices
  and kept to zero where possible.
- **MongoDB.** Same collections, same document shapes, same indexes. This was
  decided on 2026-09-07 and is not reopened here.
- **The OCR sidecar (`ocr/`, Python).** It stays as it is; the Java backend
  calls it over HTTP the way Node does.
- **The ops scripts.** Seeding, setup chains, e2e, backups and Caddy stay as
  they are. The 24 scripts that use Mongoose directly keep running on Node
  against the same database (see ADR-009).

## Decisions already made

| # | Decision | Source |
|---|---|---|
| D1 | MongoDB stays. Spring Data MongoDB + `MongoTemplate`, no JPA. | Owner, 2026-09-07 |
| D2 | No migration work touches shared things (VMs, CI, master, deploy) before 21 Dec 2026. | Owner, 2026-11-12 |
| D3 | Render is retired. The Java backend runs on OCI only. Render keeps the last Node build as a cold fallback until Java has run one real meet cleanly. | Owner, 2026-11-12 |
| D4 | Claude builds it full-time, with parallel agent sessions in separate worktrees. The owner approves stage gates and does the owner-only steps (secrets, Razorpay dashboard, OCI console). | Owner, 2026-11-12 |
| D5 | Real-time transport: a Socket.IO-protocol Java server (`socketio4j/netty-socketio`), not STOMP. | This plan, [ADR-003](ADRS.md#adr-003) |
| D6 | One switch-over of the whole backend, with instant rollback to Node over the same database. Not a route-by-route strangler. | This plan, [ADR-007](ADRS.md#adr-007) |
| D7 | One definition per concept: shared kernel + generated catalogues, wire values unchanged. | This plan, [ADR-012](ADRS.md#adr-012) |
| D8 | The COP is versioned rulebook data; engines take it as input; competitions are pinned to an edition; a reader skill proposes new editions, a person approves. | This plan, [ADR-015](ADRS.md#adr-015) |
| D9 | Project setup: Gradle – Groovy, Java, Spring Boot 4.1.2, War (run with `java -jar`), YAML, Java 25; group `com.mallakhamb`. | Owner, 2026-11-14 |

## Documents

| File | Contents | Prompt deliverables covered |
|---|---|---|
| [01-AUDIT.md](01-AUDIT.md) | The existing system: architecture, API inventory, data model, auth, sockets, technical debt, security, performance, principles assessment, risks | 1, 10, 13 (audit half) |
| [02-TARGET-ARCHITECTURE.md](02-TARGET-ARCHITECTURE.md) | Modular monolith design, package structure, technology stack, MongoDB mapping, security architecture, API compatibility rules, performance and observability | 2, 3, 4, 6, 7, 8, 10 |
| [03-REALTIME.md](03-REALTIME.md) | Socket.IO vs STOMP evaluation, the chosen design, the event compatibility matrix | 5 |
| [04-TESTING.md](04-TESTING.md) | Test strategy, with differential testing against the Node backend as the main gate | 11 |
| [05-DEPLOYMENT-AND-CUTOVER.md](05-DEPLOYMENT-AND-CUTOVER.md) | JVM on the OCI VMs, systemd, CI, cutover runbook, rollback | 12 |
| [06-ROADMAP.md](06-ROADMAP.md) | Stages, module order, agent orchestration, per-module checklist, tracking, Definition of Done | 9 |
| [08-SINGLE-SOURCE-DESIGN.md](08-SINGLE-SOURCE-DESIGN.md) | **One definition per concept:** the shared kernel (enums with behaviour, typed ids, value objects), generated catalogues (errors, messages, events, rooms, fields, routes, config, capabilities), state machines, and the tests that keep it that way | 2, 4, 6, 13 |
| [09-COP-RULEBOOK-ENGINE.md](09-COP-RULEBOOK-ENGINE.md) | **Adapting to a new Code of Points:** the COP as versioned rulebook data per edition, engines that take it as input, competitions pinned to an edition, and the `cop-update` skill that reads a COP PDF and proposes the next edition for approval | 2, 4 |
| [07-CODEGEN-AND-AGENT-KIT.md](07-CODEGEN-AND-AGENT-KIT.md) | How the code gets written: generators, context packs, the `port-unit` skill, `portCheck`, recipes, model tiering, token budget, pilot | — |
| [agent-kit/](agent-kit/) | Drafts of the `port-unit` and `cop-update` skills, the builder and reviewer agents, CONVENTIONS and RECIPES (moved into `.claude/` and `backend/` in Stage 2) | — |
| [REVIEW-2026-11-14.md](REVIEW-2026-11-14.md) | The revision-4 review: every flaw found and how it was fixed, plus the Gradle changes | — |
| [ADRS.md](ADRS.md) | Architecture Decision Records 001–015 | 14 |

## Timeline at a glance

All dates assume D2 and D4. The stage gates are owner approvals, not dates:
a stage does not start until the one before it has passed its gate.

| Stage | Window (target) | Gate to leave it |
|---|---|---|
| 0. Before 21 Dec: plan review only | now → 20 Dec | Owner approves this plan |
| 1. Discovery refresh + golden recordings | 21 Dec → 27 Dec | Contract corpus recorded from Node; audit re-checked against the code at that day's master |
| 2. Foundation | 28 Dec → 10 Jan | Milestone 2a (3 Jan): kernel + catalogues frozen, drift decided. Then skeleton passes: health, config, auth (all five roles log in from the real Web app), envelope, errors, CSRF, CORS |
| 3. Engines + rulebook runtime | 4 Jan → 17 Jan (after milestone 2a) | Scoring, ranking/tie-break, fees, panel, eligibility: bit-identical to Node on the golden vectors |
| 4. Business modules | 11 Jan → 21 Feb | Every one of the 220 routes is implemented and passes differential tests |
| 5. Real-time | 25 Jan → 14 Feb (overlaps 4) | Every Web socket screen works against Java; event matrix fully green |
| 6. Integration on staging | 22 Feb → 7 Mar | Full setup chain, e2e lifecycle and a simulated meet day pass against Java on the standby VM |
| 7. Verification | 8 Mar → 21 Mar | Load, security and failover drills pass; numbers are at least as good as the Node baseline |
| 8. Cutover | first quiet week with no meet within ±7 days | Runbook in 05; Node stays installed for rollback |

The real constraint is the meet calendar, not build speed. Stage 8 has to land
at least 7 days before or after any real meet, the same rule the OCI move used.
