# 08 — Single source of truth: the shared kernel and the catalogues

**Rule:** every concept the code depends on (a value, a name, a number, a
message, a permission, a room, an event, a setting) is **defined once**, in
one named place. Everything else refers to that place. Changing it means
editing one definition, and the compiler plus a small set of tests tell you
everything that's affected.

This document is the design for that. The generators (07) produce most of it
from the Node app, and tests (§14) stop it eroding.

## 1. Why: what Node does today (measured 2026-11-12, `Server/src` only)

| Concept | How many places define or repeat it |
|---|---|
| String literal `'superadmin'` | 64 |
| `'completed'` (status) | 44 |
| `'competition_1'` + `'Competition I'`-style display strings | 37 + 41 |
| `'Pole Mallakhamb'` / `'Rope Mallakhamb'` / `'Hanging Mallakhamb'` | 25 / 18 / 15 |
| `userType === '…'` / `role === '…'` checks | 37 / 12 |
| `res.status(NNN)` and `statusCode: NNN` literals | 52 + 13 |
| `toFixed(...)` rounding sites | 24 |
| `new Date()` / `Date.now()` (untestable clock) | 229 |
| `process.env.X` read outside `config-manager.js` | 17 |
| Mongoose enum fields | **77 across 18 models** |

Drift that already exists because of this:

- **Age groups:** two different lists. `AllAges` is valid on `Judge`, `Score`, `PerformanceOrder`, `TieBreakDraw`, `Qualification` and `startedAgeGroups`, but not on `Player`, `Team` or entries.
- **Competition type:** stored as the slug (`competition_1`) in most models and as the display form (`Competition I`) in `Score`; normalised by `toCompetitionTypeDisplay` in some paths and not others (HIGH-3 was this bug).
- **Gender:** the field is `gender` everywhere except `Team.sex`.
- **User types:** `RefreshToken.userType` allows `superadmin`; `AccountRequest.userType` doesn't; `AuditLog.adminType` has its own list.
- **Superadmin identity:** whether a superadmin's token says `userType: 'admin'` (with `Admin.role`) or `'superadmin'` is not consistent across paths; `Role` maps from both, and Stage 1 confirms each path.
- **Error codes:** `src/errors/error-codes.js` lists 23 codes, but routes also answer with codes it doesn't contain (`CSRF_TOKEN_INVALID`, `IDENTITY_MISMATCH`, `TOKEN_INVALIDATED_LOGOUT`, …), defined inline.
- **Levels:** 7 values (`zonal` was added). Several older notes and tests still say 6.
- **Category naming:** copied in `cop-rules.js`, `socket.manager.js` and `scoring.handler.js` (I–III vs I–V).

The Java port is the moment to fix this **without changing the database or
the API**: the wire values stay byte-identical, while the Java code gets one
definition per concept.

## 2. Where things live

```text
com.mallakhamb.kernel            ← the shared kernel (Gradle subproject `:kernel`): JDK only, nothing else on its classpath
├── vocabulary/   Gender, AgeGroup, CompetitionType, Apparatus, JudgeSeat, JudgeRole, Role,
│                 CompetitionLevel, ChampionshipType, CompetitionStatus, PaymentStatus, PaymentGateway,
│                 TransactionSource, TransactionType, AccountRequestKind, AccountRequestStatus,
│                 EmailType, QualificationStatus, SkipReason, WalkInStatus, RowSource, MatchChoice,
│                 ElementPhase, ElementClass, CertificationLevel, SlipAttribution, TeamSize, LevelSetBy
├── id/           EntityId (sealed), CompetitionId, TeamId, PlayerId, CoachId, AdminId,
│                 JudgeAccountId, SeatId, ScoreId, TransactionId, WalkInId, …
├── value/        Category, PanelKey, ScoreIdentity, Mark, Money, PerformanceTime, FeeWindow,
│                 EmailAddress, PlayerLoginId, PhoneNumber, PageQuery
├── wire/         WireEnum, WireEnums (index/parse helpers), DisplayForm
└── time/         DayBoundary (UTC day rules)

com.mallakhamb.platform          ← catalogues that need Spring, Jackson, Mongo or HTTP
├── error/        ErrorCode (code + HTTP status), MessageKey + messages.properties
├── access/       Capability, AccessMatrix, Requires (annotation)
├── web/          ApiRoutes, HeaderNames, CookieNames, Pagination policy
├── config/       AppProperties (+ nested records), FeatureFlags
├── json/         KernelJacksonModule (the only bridge between kernel types and Jackson)
├── cache/        CacheName (+ TTL from config)
├── ratelimit/    RateLimitPolicy
├── metrics/      MetricNames
└── mongo/        WireEnum/EntityId converters, generated *Fields path constants per document

com.mallakhamb.realtime.api      ← RealtimeEvent, RealtimeMessage (sealed), RoomId, Rooms
com.mallakhamb.modules.audit.api ← AuditAction
com.mallakhamb.modules.notification.api ← EmailTemplate
```

`kernel` replaces `engines/vocabulary` from 02 §3. The engines depend on the
kernel; every module depends on the kernel; the kernel depends on nothing
(ArchUnit).

## 3. Domain enums: `WireEnum`

Every enum stored in Mongo or sent over the API implements one interface. The
Java constant name is clean; the **wire value** is exactly what Node stores
and sends.

```java
public interface WireEnum { String wire(); }

public enum AgeGroup implements WireEnum {
  UNDER_10("Under10"), UNDER_12("Under12"), UNDER_14("Under14"), UNDER_16("Under16"),
  UNDER_18("Under18"), ABOVE_16("Above16"), ABOVE_18("Above18"),
  ALL_AGES("AllAges");                                  // a category value only, never an athlete's or an entry's

  /** Values an athlete, a team or an entry may carry (Node: Player/Team/entry enums). */
  public static final Set<AgeGroup> ENTRY = Collections.unmodifiableSet(EnumSet.range(UNDER_10, ABOVE_18));
  /** Values a category (panel, score sheet, running order, draw) may carry. */
  public static final Set<AgeGroup> CATEGORY = Collections.unmodifiableSet(EnumSet.allOf(AgeGroup.class));

  private static final Map<String, AgeGroup> BY_WIRE = WireEnums.index(values());
  private final String wire;
  AgeGroup(String wire) { this.wire = wire; }

  @Override public String wire() { return wire; }
  public static AgeGroup fromWire(String value) { return WireEnums.parse(BY_WIRE, value, AgeGroup.class); }
}
```

The kernel has **no Jackson dependency**. One `KernelJacksonModule` in
`platform.json` serialises every `WireEnum` by `wire()` and parses it with the
enum's `fromWire`, and renders every `EntityId` as hex, so no enum or id
needs an annotation.

Rules:

- Dependency **versions** are single-sourced too: `gradle/libs.versions.toml` is the only place a version number appears.
- **One converter pair** in `platform.mongo` (a `GenericConverter` for "any `WireEnum` ⇄ `String`") covers every enum in every document. Nobody writes per-enum converters.
- `WireEnums.parse` throws `ValidationException(ErrorCode.INVALID_INPUT, MessageKey.INVALID_ENUM_VALUE)` with Node's message, so an invalid value fails the same way everywhere.
- **Subsets are named constants on the enum** (`AgeGroup.ENTRY`, `Apparatus.forGender(g)` from rule data, `JudgeSeat.EVALUATORS`), never re-listed at a call site.
- **Behaviour belongs to the enum** when it's intrinsic: `CompetitionType.display()`, `JudgeSeat.seatNo()`, `JudgeSeat.slipRole()`, `JudgeSeat.isEvaluator()`, `Role.rank()`.
- **Legacy and alternative spellings** are accepted in exactly one place: `fromAny(...)` on the enum (`CompetitionType.fromAny("Competition I")` ≡ `fromAny("competition_1")`, which replaces `toCompetitionTypeDisplay`).
- **Rule-driven facts stay in rule data, not in the enum.** Which apparatus a gender may compete on, team sizes and counted places come from the **rulebook of the competition's COP edition** (09); fee amounts come from the fee rule data. So a COP change is a new rulebook file, not an edit to Java enums.

### Enum catalogue (generated, then reviewed)

| Enum | Wire values (exactly Node's) | Behaviour on the enum | Notes |
|---|---|---|---|
| `Gender` | `Male`, `Female` | — | `Team.sex` maps to a Java field called `gender` (`@Field("sex")`) |
| `AgeGroup` | 7 entry values + `AllAges` | `ENTRY`, `CATEGORY` | Resolves the two-list drift |
| `CompetitionType` | slug `competition_1..3`; display `Competition I..III` | `display()`, `fromAny()`, `roman()` | One type for both forms (§4) |
| `Apparatus` | `Pole Mallakhamb`, `Hanging Mallakhamb`, `Rope Mallakhamb` | `shortKey()` (if Node keys maps by short names, from the pack) | Gender rules in rule data |
| `JudgeSeat` | `Senior Judge`, `Judge 1`…`Judge 4`, `Scorer`, `Time Keeper` | `seatNo()` 1–7, `isEvaluator()`, `slipRole()`, `scoreField()` (`seniorJudge`/`judge1`…), `EVALUATORS`, `RECORDERS`, `maySeatTogether()` | Generated from `config/judge-seats.js` + `judge-slip.util.js`: the one role mapping |
| `JudgeRole` | `CHIEF`, `SR_JUDGE`, `J1`…`J5` | — | Slip role |
| `Role` | `player`, `coach`, `judge`, `admin`, `superadmin` | `rank()` 1–5, `atLeast(Role)` | Replaces the 37 + 12 string checks; `userType` and `Admin.role` both map to it |
| `CompetitionStatus` | `upcoming`, `ongoing`, `completed` | `canMoveTo()` (§9) | |
| `CompetitionLevel` | `district`, `zonal`, `state`, `national`, `international`, `university`, `dso` | display labels from `competition-levels.js` | 7, not 6 |
| `PaymentStatus` | `pending`, `completed`, `failed` | `canMoveTo()` | One writer (T13) |
| `TransactionSource` / `TransactionType` | `coach`/`superadmin`; `team_submission`/`player_add`/`other` | — | |
| `AccountRequestKind` / `AccountRequestStatus` | from `AccountRequest` | `canMoveTo()` | |
| `QualificationStatus`, `SkipReason`, `WalkInStatus`, `RowSource`, `MatchChoice`, `EmailType`, `ElementPhase`, `ElementClass`, `CertificationLevel`, `SlipAttribution`, `ChampionshipType`, `LevelSetBy`, `PaymentGateway` | from the models | state machines where they have one | |
| `TeamSize` | `4`, `6` (numbers on the wire) | `countedPerApparatus()` 3 / 5 | A numeric wire enum: same pattern with an `int` |

**Nullable enums:** Mongoose lists `null` in several enums. In Java that is
`Optional`/`@Nullable` on the field, never a `NONE` constant, so "absent" is
not a value someone can accidentally store.

## 4. Two storage forms for one concept (`CompetitionType`)

Java code only ever sees `CompetitionType`. Storage keeps Node's form per
collection:

- most documents: the slug, through the normal `WireEnum` converter;
- `scores.competitionType`: the display form. `ScoreDocument` declares that field as `DisplayForm<CompetitionType>` (a tiny record in `kernel.wire`), and its converter writes `display()` and reads with `fromAny`.

The generator picks the form from the Mongoose enum values (slug list vs
display list), so nobody has to remember which collection uses which. Room
ids use **both** forms through `Rooms` (§8).

## 5. Typed ids

```java
public sealed interface EntityId permits CompetitionId, TeamId, PlayerId /* … */ { ObjectId value(); }
public record CompetitionId(ObjectId value) implements EntityId {
  public CompetitionId { Objects.requireNonNull(value); }
  public static CompetitionId parse(String hex) { return new CompetitionId(ObjectIds.parse(hex)); }  // Node's invalid-id message
}
```

- Used in documents, application services, domain and engines. One converter pair handles every `EntityId` in Mongo; Jackson renders them as the 24-hex string (`_id` stays `_id`).
- Why it's worth it here: scoring and registration methods take 4–6 ids at once (competition, team, player, seat, score…). With plain `ObjectId`s, swapping two compiles fine and misattributes a slip. With typed ids, it doesn't compile.
- Path variables bind directly: `@PathVariable TeamId teamId` (one `Formatter` registered once).

## 6. Value objects (rules about a value live with the value)

| Value object | Replaces | Owns |
|---|---|---|
| `Category(gender, ageGroup, competitionType)` | the `{gender, ageGroup, competitionType}` triple passed around everywhere; the 4 copies of `ageGroup === X && gender === Y` | equality, `matches(entry)`, room ids |
| `PanelKey(category, apparatus)` | panel lookups | seat-plan lookups |
| `ScoreIdentity(teamId, category, competitionId)` | the 5-field `score_identity_unique` key | the query for one score sheet |
| `Mark` | raw doubles for marks | the 0.05 / 0.1 grids, section ceilings check, JS-parity rendering via `JsNumber` |
| `Money` (rupees, `BigDecimal`, INR) | numbers for fees and amounts | `toPaise()` for Razorpay (the only place × 100 happens), JS-parity rendering |
| `PerformanceTime` | `"MM:SS"` / seconds strings | `parse` (all of Node's accepted forms), `seconds()`, the time-window check against the `Rulebook` |
| `FeeWindow(opens, feeDue, lateFee)` | 3 loose dates | phase calculation hooks for the fee engine; UTC day boundaries via `DayBoundary` |
| `EmailAddress` | strings + regexes in validators | normalisation (trim, lower-case) and **Node's exact regex** (including the ≤ 3-character TLD quirk of the Player model) |
| `PlayerLoginId` | `firstname.lastname.ddmmyy(.n)` building/parsing | generation and collision suffix |
| `PhoneNumber` | contact-number checks | Node's normalisation (`contact-number.test.js` pins it) |
| `PageQuery(page, limit, sort)` | ad-hoc `page`/`limit` parsing | defaults and caps from config; allowed sort fields as an enum per list |

Value objects are records, validated in the compact constructor, and parsed
from strings in one static method. Request DTOs carry them directly
(`@Valid EmailAddress email` through a Jackson creator), so every endpoint
validates the same way.

## 7. Catalogues (names, codes, messages, numbers)

| Catalogue | Shape | Generated from | Replaces |
|---|---|---|---|
| `ErrorCode` | `enum ErrorCode { VALIDATION_ERROR(400), …, COMPETITION_LOCKED(423), CSRF_TOKEN_INVALID(403), IDENTITY_MISMATCH(401), … }`: the code **and** its HTTP status | `error-codes.js` **plus every code literal found in `src/` by AST** (the file is incomplete) | 52 `res.status(NNN)` + 13 `statusCode:` literals; errors set no status by hand |
| `MessageKey` + `messages.properties` | `enum MessageKey { TEAM_NOT_FOUND, … }`; text in `messages.properties` (the exact Node string), resolved through Spring `MessageSource` | every message literal in `throw` / `res.json` / validators (AST), deduplicated by text; template literals (`` `Team ${name} not found` ``) become `{0}` placeholders with the argument order recorded | Hundreds of inline strings. **All user-facing text in one file**, ready for Hindi/Marathi bundles later without touching code |
| `RealtimeEvent` + sealed `RealtimeMessage` | `record ScoreUpdated(...) implements RealtimeMessage { public RealtimeEvent event() { return RealtimeEvent.SCORE_UPDATED; } }` | `socket/events/event-types.js` + the emits found in the slices | Event-name strings; **a payload can't be sent under the wrong event name**, because the message type carries its event |
| `RoomId` + `Rooms` | `Rooms.scoring(category)` → both forms; `Rooms.competition(id)` | `scoring-room.util.js` | Room strings, the `competition:` vs `competition_` bug class |
| `CookieNames`, `HeaderNames` | constants | `cookie.util.js`, middleware | `'access_token'`, `X-CSRF-Token`, `X-New-Token`, `X-Correlation-ID`, `X-Competition-Id`, `x-user-type` |
| `ApiRoutes` | per-module path constants (`ApiRoutes.Coach.TEAM = "/coaches/team"`) used by controllers **and** tests | `openapi.json` | Paths typed twice |
| `CacheName` | `enum CacheName { COMPETITIONS, COMPETITION, TEAMS, TEAM, PROFILE }` with TTL/size from config | `cache.service` keys | Glob-pattern cache keys |
| `RateLimitPolicy` | `enum RateLimitPolicy { AUTH_GUESSABLE, PER_USER, JUDGE_LOGIN, ACCOUNT_… }` with key strategy; numbers from config | `security.middleware.js` | Three hand-built limiters |
| `AuditAction` | enum of audited operations | `req.audit(op, …)` call sites | Free-text op names |
| `EmailTemplate` | enum: template file + subject `MessageKey` + required model fields | `services/email/templates` | Template names as strings |
| `MetricNames` | constants matching prom-client names | `prometheus/registry.js` | Metric-name strings (dashboards depend on them) |
| `*Fields` (one per document) | `CompetitionFields.RT_TEAM = "registeredTeams.team"`, `CompetitionFields.rtSet(IS_SUBMITTED)` → `"registeredTeams.$[e].isSubmitted"` | Mongoose `schema.paths` | Field-path strings inside `Criteria`/`Update`, where a typo matches nothing and returns 200 (the api-known-defects trap) |
| `Rulebook` (data, **per COP edition**) | `rulebooks/cop-<edition>.json`: tolerance table, ceilings, element values and requirements, time window, deductions, panel methods, tie-break step order, age ranges, apparatus by gender, checklist wording, each with its COP section | `config/cop-rules.js` + the rule constants in the scoring utils | Numbers in code; the tolerance if-ladder copy; one hard-coded edition (09) |

## 8. Access: capabilities in one matrix

Node checks roles in 49 places by string, plus seat checks. Java uses one
table:

```java
public enum Capability {
  SUBMIT_JUDGE_SLIP, SAVE_SCORER_SHEET, RECORD_TIME, MANAGE_RUNNING_ORDER,
  MANAGE_PANELS, MANAGE_ENTRIES, LOCK_SCORES, UNLOCK_SCORES, CORRECT_SCORES,
  RECORD_TIE_BREAK_DRAW, FINALIZE_QUALIFICATION, MANAGE_COMPETITIONS, MANAGE_ADMINS,
  RUN_WALK_IN_DESK, VIEW_TRANSACTIONS, /* … generated from the route guards … */
}

final class AccessMatrix {   // the ONLY place that says who may do what
  static final Map<Capability, Rule> RULES = Map.ofEntries(
      // ILLUSTRATIVE ONLY: the real rules are generated from Node's guard chains (e.g. requireScoringAccess)
      entry(SUBMIT_JUDGE_SLIP, Rule.seats(JudgeSeat.EVALUATORS).or(Rule.roles(ADMIN, SUPERADMIN))),
      entry(SAVE_SCORER_SHEET, Rule.seats(SCORER).or(Rule.roles(ADMIN, SUPERADMIN))),
      entry(CORRECT_SCORES,    Rule.roles(SUPERADMIN)),
      /* … */);
}

@PostMapping(ApiRoutes.Public.SAVE_SCORE)
@Requires(Capability.SUBMIT_JUDGE_SLIP)
@CompetitionScoped @LockedAfterEndDate
ApiEnvelope<SaveScoreResponse> publicSaveScore(...)
```

- The initial matrix is **generated from the Node guard chains** (`requireRole('judge','admin','superadmin')` → a capability per distinct guard set), and `RouteSecurityManifestTest` proves every route allows exactly the same roles as Node.
- Seat checks are part of the rule (`Rule.seats(...)`), evaluated against `AuthPrincipal.judgeSeats` for the category being acted on.
- Ownership (the coach owns the team, the admin is assigned to the meet) stays in the application service. It depends on data, not just identity. But it uses shared predicates (`Ownership.coachOwnsTeam`, `CompetitionScope.allows`), not ad-hoc code.
- Adding a role or moving a permission is one edit in `AccessMatrix`; the manifest test shows every route it changes.

## 9. State machines on the enum

```java
public enum PaymentStatus implements WireEnum {
  PENDING("pending"), COMPLETED("completed"), FAILED("failed");
  // ILLUSTRATIVE: Stage 1 copies the real transitions from the Node writers
  // (registration.service + the webhook); none are invented here.
  private static final Map<PaymentStatus, Set<PaymentStatus>> NEXT = Map.of(
      PENDING, EnumSet.of(COMPLETED, FAILED),
      FAILED,  EnumSet.of(PENDING, COMPLETED),
      COMPLETED, EnumSet.noneOf(PaymentStatus.class));
  public boolean canMoveTo(PaymentStatus next) { return NEXT.get(this).contains(next); }
}
```

For `CompetitionStatus` (`validateStatusTransition`), `PaymentStatus` (two
writers today), `AccountRequestStatus`, `WalkInStatus`, `QualificationStatus`.
**The transitions are copied from what Node allows, including its
permissiveness**, and pinned by tests. Where Node has no explicit check, the
table allows every transition Node's code can produce, so behaviour doesn't
change.

## 10. Configuration: one typed tree

```java
@ConfigurationProperties("mallakhamb") @Validated
public record AppProperties(Jwt jwt, Cookies cookies, Csrf csrf, Cors cors, RateLimits rateLimits,
                            Db db, Email email, Payment payment, Ocr ocr, Cache cache, Otp otp,
                            Lockout lockout, Scheduling scheduling, Features features, Realtime realtime) { … }
```

- **Env var names stay Node's** (`JWT_SECRET`, `DB_POOL_MAX`, `OTP_LENGTH`, …), mapped in `application.yaml` (`mallakhamb.jwt.secret: ${JWT_SECRET}`), so `/etc/mallakhamb/app.env` and the Vault secret don't change.
- Defaults and refuse-to-start validations equal Node's `config-manager.js` (generated table, reviewed).
- No `System.getenv`, no `@Value` outside `platform.config` (ArchUnit). Node has 17 stray `process.env` reads; each becomes a property.
- `spring-boot-configuration-processor` generates metadata; a build step renders `backend/CONFIG.md` from it. The config reference can't drift from the code.
- `Features` holds the switches (`discountCodeEnabled`, `csrfEnabled`, `rateLimitEnabled`, `apiDocsEnabled`, `debugRoutesEnabled`), each read through one bean.

## 11. Time and numbers

- **`Clock` bean everywhere.** `Instant.now()`, `LocalDate.now()`, `new Date()` and `System.currentTimeMillis()` are banned outside `platform.time` (Node has 229 direct clock reads). This makes the end-date lock, fee phases, the midnight sweep and OTP expiry testable, and lets the twin-run freeze time.
- **`DayBoundary`** owns "end of day UTC" and "same UTC day" (fee window, end-date lock at 23:59 UTC).
- **`JsNumber`** is the only rounding and rendering code (Node has 24 `toFixed` sites); scales come from the `Rulebook` (`finalScore.scale`).
- No numeric literals in business code except 0 and 1. Thresholds come from the `Rulebook`, `AppProperties` or an enum.

## 12. API-level single sources

| Concern | One place |
|---|---|
| Response envelope | `ApiEnvelope.ok/created/error` |
| Error → HTTP mapping | `ErrorCode` |
| Pagination defaults, caps and response shape | `PageQuery` + `PagedResponse<T>` |
| Validation patterns | value objects (§6) and a handful of constraint annotations (`@WireValue(AgeGroup.class)`, `@ObjectIdString`, `@MarkValue`) |
| `/api` and `/api/v1` prefixes | `ApiPrefixConfig` |
| Path strings | `ApiRoutes` |
| Guard per route | `@Requires(Capability)` + `AccessMatrix` |

## 13. Changing one thing: what you edit

| Change | Edit | The tools then show you |
|---|---|---|
| Add an apparatus | `Apparatus` enum + rule data (gender, fees) | Compile errors in every exhaustive `switch`; golden vectors; Web literal list (§15) |
| Add an age group | `AgeGroup` (+ `ENTRY` if athletes can have it) + COP rule data | Same; the eligibility engine tests |
| Add Competition IV | `CompetitionType` + its requirements in a new rulebook edition (09) | Rooms, display, scoring requirements: all derived |
| Add a judge seat | `JudgeSeat` (seat no, evaluator?, slip role, score field) | Panel engine, `AccessMatrix` seat rules, manifest test |
| Change who can unlock scores | `AccessMatrix` | `RouteSecurityManifestTest` lists every affected route |
| A new COP edition (values, counts, wording, step order) | a new `rulebooks/cop-<edition>.json`, proposed by the `cop-update` skill from the PDF and approved by a person (09) | The PDF's worked examples as tests; per-edition golden vectors; old meets stay on their edition |
| Change the late fee rule | fee rule data or the fee engine | Fee golden vectors |
| Reword an error message | `messages.properties` | The contract test flags it (a message is frontend-visible), so it's a deliberate act |
| New setting | an `AppProperties` record field (+ env mapping) | `CONFIG.md` regenerates; refuse-to-start validation in one place |
| New socket event | a `RealtimeMessage` record + `RealtimeEvent` constant | The contract test asks for a recording |

**Exhaustive `switch` over enums is required** (no `default` branch on a
domain enum, Error Prone `MissingCasesInEnumSwitch` as an error). This is what
makes "add a value" show every place that has to decide something.

## 14. How this is enforced (so it lasts)

| Check | How |
|---|---|
| No wire value as a literal outside the kernel and the generated files | `SingleSourceTest`: for every `WireEnum` value, event name, cookie and header name, room prefix, error code and message text, scan the Java sources and fail on a string literal **whose whole value equals** a catalogued value (a log line that merely contains "completed" is fine). Allow-list: `kernel`, generated files |
| No HTTP status numbers | ArchUnit + scan: `ResponseEntity.status(int)`, `HttpStatus.valueOf` only in `platform.web` |
| No clock calls | Error Prone/ArchUnit: banned methods outside `platform.time` |
| No `System.getenv` / `@Value` outside config | ArchUnit |
| No rounding outside `JsNumber` | ArchUnit: `BigDecimal.setScale`, `Math.round`, `String.format("%.…f")` banned elsewhere |
| No raw `ObjectId` in application/domain signatures | ArchUnit |
| No Mongo field-name string literals in `Criteria`/`Update` | scan: string literals passed to `Criteria.where`/`Update.set` must come from `*Fields` |
| Exhaustive enum switches | Error Prone (`MissingCasesInEnumSwitch` as error, `UnnecessaryDefaultInEnumSwitch`) |
| Generated catalogues not hand-edited | CI hash check (07 §1) |
| Catalogues vs Node | Drift report on regeneration (§16) |

## 15. The frontend (not changed now; prepared)

Web has the same problem (`'Senior Judge'` ×38, `'Male'` ×39, `scoring_`
×23, the 505-line COP mirror). Changing Web is out of scope for the port. But
the backend will publish the vocabulary once, as a build artifact
(`backend/target/vocabulary.json`: every `WireEnum` with wire, display and
order, the seat table, competition types, levels, event names) and optionally
at `GET /api/public/vocabulary` **after** cutover. A post-cutover task can
then generate `Web/src/constants/vocabulary.js` from it and retire the Web
literals and the COP mirror, the same way the backend did. That is listed as a
follow-up in 06 §6, not part of the port.

## 16. Generator drift report

When `gen-enums` runs it also writes `backend/generated/VOCABULARY-DRIFT.md`:
every concept whose Node definitions disagree (the AgeGroup lists, Team `sex`,
user-type lists, missing error codes, I–III vs I–V). Each row gets a decision
before Stage 2 ends: how the one Java definition represents it **without
changing stored or wire values**. The current known rows are listed in §1.
