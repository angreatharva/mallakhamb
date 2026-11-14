# Backend conventions (draft; final version lives at backend/CONVENTIONS.md)

Only rules that tools **don't** enforce are here. Formatting, layering,
placement, null-safety, exhaustive switches, literal bans and forbidden calls
are enforced by Spotless, ArchUnit, Error Prone and `SingleSourceTest`. The
design behind these rules is in `docs/springboot-migration/08-SINGLE-SOURCE-DESIGN.md`.

## 1. One definition per concept: look it up, never spell it
| You need | Use | Never |
|---|---|---|
| A domain value (gender, age group, seat, status, apparatus, level…) | the kernel `WireEnum` (`AgeGroup.UNDER_14`) | `"Under14"` |
| A subset of values | the enum's named set (`AgeGroup.ENTRY`, `JudgeSeat.EVALUATORS`) | re-listing the values |
| An id | the typed id (`TeamId`) | `ObjectId`/`String` in a signature |
| A category, panel, score identity, mark, money, time, email, login id, page | the value object (`Category`, `Mark`, `Money`, `PerformanceTime`, …) | loose fields and local parsing |
| An error | `ErrorCode` + `MessageKey` | a status number or message text |
| A socket event | a `RealtimeMessage` record | an event-name string |
| A room | `Rooms.scoring(category)` / `Rooms.competition(id)` | string concatenation |
| A Mongo field path | `<Doc>Fields.X` / `entrySet(...)` | a path string |
| A route path | `ApiRoutes.*` (generated) | a path string |
| Who may do it | `@Requires(Capability.X)`; ownership via `Ownership.*` | `role == …` / `userType == …` |
| A setting, limit or switch | an `AppProperties` field | `@Value`, `System.getenv`, a numeric literal |
| A COP number, table, wording or step order | the competition's `Rulebook` (09) / the engine | a numeric literal or copied text |
| The time | the injected `Clock` | `Instant.now()` |
| Rounding or JS-style rendering | `JsNumber` | `setScale`, `Math.round`, `String.format` |
| A cache, limiter, metric, audit action, email | `CacheName`, `RateLimitPolicy`, `MetricNames`, `AuditAction`, `EmailTemplate` | names as strings |

**If the thing you need doesn't exist in a catalogue, don't create it
locally.** Record `needs-lead: add <concept> to <catalogue>`. The lead adds it
in the one place (usually by fixing a generator), and every module gets it.

## 2. Naming
- Controller method = the **operationId** (generated).
- Application service method = the use case as a verb phrase (`submitEntry`, `unlockAthlete`). Aliases (an admin route and a superadmin route doing the same thing) call one service method.
- Enum constants are clean Java (`TIME_KEEPER`); the wire value lives only in the constructor argument.
- Records: `<Thing>Request`, `<Thing>Response` in `web.dto`; `<Thing>Document` in `infrastructure`; plain nouns in `domain`.
- Booleans read as questions: `isSubmitted`, `hasMinimumJudges`, `canMoveTo`.

## 3. Shape of a use-case method
1. Load (stores/repositories; projections only).
2. Decide (engines, enum behaviour, value objects; no I/O).
3. Write (one store call, or a transaction where the recipe says so).
4. Side effects through `SideEffects.run`, in this order: audit → cache eviction → realtime → email. A failure is logged, never fails the request.
5. Return the response record.

## 4. Where behaviour goes
- Intrinsic to a value → a method on the enum or value object (`seat.isEvaluator()`, `money.toPaise()`, `time.withinWindow(rules)`).
- A competition rule → the engine.
- Who may act → `AccessMatrix` / `Ownership`.
- Orchestration → the application service.
If you're writing the same `if` in a second place, it belongs in one of the first three.

## 5. Errors
Throw the platform exceptions with an `ErrorCode` and a `MessageKey`. Never
catch-and-ignore; never catch `Exception` except at the platform boundary.
If Node answers with a code, status or message that isn't in the catalogues,
that's a generator gap: `pack-gap`.

## 6. Data mapping
Never return a `*Document`. Use the generated `Response.from(Document)`; a
composed response gets a `*Mapper` in `web`. The record's fields are the PII
allow-list.

## 7. Comments and logs
- Comment *why*, with the Node `file:line` when behaviour looks odd but is deliberate.
- Structured logs (`log.atInfo().addKeyValue(LogKeys.TEAM_ID, teamId).log(…)`; `LogKeys` is a catalogue too). Never log a body, token, password, OTP or email address.

## 8. When to add an interface
Only for: a store of one of the two hard aggregates, an external system
(email, payment, OCR), the realtime publisher. Everything else is a concrete
class. (The clock is the JDK's `Clock`.)
