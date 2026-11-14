# 01 — Audit of the existing backend

Baseline: master `e364596` (2026-11-12). Sources: the code, plus the in-repo
agent docs `Server/MEMORY/*` (last checked against `f5465b4` on 2026-11-11),
spot-checked against the code for this audit. **Stage 1 re-runs this audit on
the master of 21 Dec**, because December fixes will land after this was
written.

## 1. Size and shape

| Area | Lines (JS) | Notes |
|---|---|---|
| `src/services` | 23,290 | 46 files. Largest: `scoring.service` 2,153, `admin.service` 2,070, `coach.service` 1,604, `super-admin.service` 1,286, `walk-in.service` 1,084 |
| `src/utils` | 5,868 | Pure helpers; contains the scoring/ranking/tie-break engines |
| `src/infrastructure` | 3,893 | DI container, bootstrap, logger, DB connection, index manager, migration runner, health, shutdown, Prometheus |
| `src/routes` | 3,226 | 16 routers, one `apiRouter` mounted twice (`/api/v1`, `/api`) |
| `src/middleware` | 2,933 | auth, CSRF, CORS/helmet/rate limits, competition scope, end-date lock, coalescing, audit, correlation, errors |
| `src/validators` | 2,850 | express-validator chains |
| `src/controllers` | 2,787 | 19 controllers |
| `src/models` | 2,743 | 18 Mongoose models |
| `src/repositories` | 2,661 | 18 repositories over `BaseRepository` (always `.lean()`) |
| `src/docs` | 2,650 | OpenAPI generator source |
| `src/socket` | 1,493 | `SocketManager` + 2 handlers + event constants |
| `src/config` | 1,514 | `cop-rules.js` (COP Nov 2022 tables), `payment.config.js` (fee engine), `judge-seats.js`, `competition-levels.js`, `config-manager.js` |
| `src/migrations` | 1,509 | 001–016, all applied on live databases |
| **Total `src/`** | **57,655** | |
| Tests | 112 files | Jest + mongodb-memory-server + supertest + socket.io-client; 901/901 green at the last recorded full run (2026-10-16); Stage 1 records the current count |

## 2. Existing architecture

```mermaid
flowchart LR
  subgraph Clients
    SPA[React SPA<br/>Web/ — axios + socket.io-client]
    Pay[Razorpay<br/>webhooks]
    Ops[Node ops scripts<br/>seed / setup / e2e]
  end
  subgraph OCI VM (active)
    Caddy[Caddy TLS<br/>api. / app. / ocr.]
    subgraph Node process
      MW[Express pipeline<br/>helmet, CORS, CSRF,<br/>sanitize, coalescing, audit]
      R[16 routers x2 mounts<br/>220 operations]
      C[19 controllers]
      S[46 services]
      Repo[18 repositories]
      IO[Socket.IO server<br/>SocketManager + handlers]
      Timer[competition-status<br/>midnight sweep]
    end
    OCR[OCR sidecar<br/>Python :8090]
    Mongo[(mongod RS member)]
  end
  Redis[(Redis — optional,<br/>unset in prod)]
  Mail[Gmail API / SMTP / Resend]
  SPA -->|HTTPS + cookies/Bearer| Caddy --> MW --> R --> C --> S --> Repo --> Mongo
  SPA -->|Socket.IO polling→ws| Caddy --> IO
  S -->|emitToRoom / emitToUser| IO
  IO --> S
  Pay --> Caddy
  S --> OCR
  S --> Mail
  S -.-> Redis
  Ops --> Mongo
  Ops -->|HTTP| Caddy
```

The layering is **routes → controllers → services → repositories → models**,
wired by a hand-written DI container (`src/infrastructure/di-container.js`,
`bootstrap.js`). Socket.IO shares the HTTP server. Services get the
`socketManager` injected *after* construction through a lazy getter (the
"two-phase socket wiring"). A service missing from `servicesNeedingSocket`
silently never broadcasts.

## 3. API inventory (summary)

The full list of operations is `Server/docs/openapi.json`, generated from the
live router and checked by `npm run docs:openapi:check`. **That file is the
contract the port is tested against.** Stage 1 regenerates it on the 21 Dec
master.

| Prefix | Ops | Auth | What it covers |
|---|---|---|---|
| `/api/health` (+ `/health-legacy`) | 5 | none / metrics token | live, ready, full, Prometheus `/metrics`, ping |
| `/api/csrf-token` | 1 | none | Issues the signed double-submit token |
| `/api/auth` | 15 | mixed | per-role register/login, `me`, refresh, logout, set-competition, forgot/verify-OTP/reset, Player-ID sign-in |
| `/api/players` | 7 | player | profile, teams, competitions, stats |
| `/api/coaches` | 24 | coach | team building, registration, coach-registered players, payment orders, account requests |
| `/api/teams` | 8 | mixed | team read/write |
| `/api/competitions` | 16 | mixed | list, detail, registration windows, levels |
| `/api/admin` | 43 | admin, admin-or-scorer | entries, judges/panels, lots and running order, scoring, locks/unlocks, transactions, qualification finalize, tie-break draws |
| `/api/superadmin` | 51 | superadmin | everything admin does, across every meet, plus correction tools (accounts, entries, teams, scores, history) |
| `/api/judge` | 17 | judge | dashboard, team players, sheets, seat-scoped reads, sequence |
| `/api/public` | 9 | anon or judge/admin | public scores, teams, competitions, COP rules (ETag), `save-score` (**the busiest write — judges post slips here**) |
| `/api/stats` | 4 | various | profile stats, fairness board |
| `/api/desk` | 19 | admin, superadmin | walk-in desk: paper-form PDF, image upload (raw `image/*` body) → OCR → review → coach + team + players + pay |
| `/api/webhooks` | 1 | HMAC | Razorpay webhook (HMAC-SHA256 over the **raw** body) |
| **Total** | **220 ops on 194 paths** | | Every one is also served at `/api/v1/...` |

The Web app has an `/api/docs` Swagger UI (off in production) and debug routes
(off in production). Neither is ported to production; SpringDoc replaces the UI
in dev.

## 4. Data model inventory

18 collections. The two hard ones are marked ★.

| Model / collection | Role | Port notes |
|---|---|---|
| `Admin` | admins + superadmin (`role` enum) | `select:false` password and lockout fields |
| `Coach` | coach accounts | |
| `Player` | athletes; email or Player ID (`loginId`), guardian email | encrypted default password (AES-256-GCM) when the coach registered them |
| `JudgeAccount` → `judges` | the person | |
| `Judge` → `judgeassignments` | a panel **seat** (7 seat types, per apparatus) | never unique on `{judgeAccount, competition}` |
| ★ `Competition` | aggregate root; `registeredTeams[]` is the **only** record of an entry | Read amplification. Solved with aggregation pipelines; writes are team-addressed `arrayFilters` with `matchedCount` checks. `apparatusConfig` / `apparatusByGender` / `apparatusFees` are Maps. `apparatus` on a player entry is `Mixed` in 3 legacy shapes |
| `Team` | name + coach (+ level after migration 014) | |
| ★ `Score` | one doc per `{teamId, gender, ageGroup, competition, competitionType}`; `playerScores[].judgeSlips[]` | Write concurrency. `__v` optimistic guard + application-side merge + bounded retry. `competitionType` stored in **display** form (`Competition I`) unlike everything else |
| `PerformanceOrder` | running order / lots | |
| `TieBreakDraw` | recorded physical lucky draws | read by the ranking engine |
| `Qualification` | Comp I → II/III finals | |
| `Transaction` | payments (`source`, `type`), webhook idempotency (migration 011) | |
| `RefreshToken` | hashed tokens, family, TTL index | |
| `SessionRevocation` | durable logouts (security audit 2026-10-31) | |
| `AccountRequest` | coach-only requests | |
| `PlayerTeamConflict` | team-per-level conflicts | |
| `WalkInRegistration` | walk-in desk drafts | |
| `AuditLog` | audit trail | `adminId` has no `ref`, but one read populates it |
| `migrations` | migration runner state (001–016 applied) | |

Things every Java document mapping has to keep:

- **`_id` as ObjectId, rendered as a 24-hex string** in JSON under the key
  `_id` (not `id`). Populated references render as nested objects with `_id`.
- **`__v`** (Mongoose version key). Read on `Score` for the optimistic guard;
  incremented by Mongoose on array-changing saves elsewhere. Java must map it
  as a plain field named `__v` and `$inc` it where Node does. **Not** Spring's
  `@Version`, which would start a second counter (see ADR-004).
- **`createdAt` / `updatedAt`** (Mongoose `timestamps`), set by hand in Java
  on every insert and update, including `findOneAndUpdate` / `updateMany`
  paths. Note: `timestamps` is why `modifiedCount` lies on `arrayFilters`
  updates, so check `matchedCount` with the element condition in the filter.
- **Enum string values exactly** (`'Senior Judge'`, `'Judge 1'`, `'Competition I'`, `competition_1`, `'Pole Mallakhamb'`, `Under14`…).
- **Mixed / Map fields stay as `org.bson.Document` / `Map<String,Object>`.**
  Do not "type" them during the port; the three legacy apparatus shapes are
  normalised in code (`apparatus.util.js`), and that stays true in Java.
- Schema defaults and `pre('validate')` hooks (for example, Scorer seat 7 → 6) move into the write paths explicitly.

## 5. Authentication and authorization flow

```mermaid
sequenceDiagram
  participant B as Browser (SPA)
  participant A as API
  B->>A: GET /api/csrf-token
  A-->>B: body {token} + csrf-token cookie (signed HMAC, SameSite=None)
  B->>A: POST /api/auth/<role>/login (X-CSRF-Token)
  A->>A: lockout check (+loginAttempts +lockUntil), bcrypt compare
  A-->>B: access_token + refresh_token cookies (httpOnly, Secure, SameSite=None)<br/>+ token in body (stored per-tab, sent as Bearer)
  B->>A: any request (cookie and/or Bearer)
  A->>A: cookie wins; Bearer naming a different user → 401 IDENTITY_MISMATCH
  A->>A: HS256 verify, iat vs logout record (SessionRevocation / Redis / memory)
  A->>A: load user, isActive, judge seats for the token's competitionId
  A-->>B: response (+ X-New-Token and new cookie if token > 12 h old)
  B->>A: POST /api/auth/refresh (refresh cookie only)
  A->>A: SHA-256 lookup, reuse → revoke whole family
```

Facts that have to be identical in Java (the browser and the JWTs already in
circulation depend on them):

- **JWT:** HS256 only, secret `JWT_SECRET`, claims exactly
  `{ userId, userType, competitionId?, auth_time, iat, exp }`
  (`token.service.generateToken`). `auth_time` carries through rotation and
  caps the session's absolute length (`MAX_SESSION_MS`). Tokens already issued
  by Node must verify in Java and the reverse, so a cutover logs nobody out.
  The SPA **decodes the token itself** (`jwtDecode` in `api-client.js`), so
  the claim names are a frontend contract. Finding: that code reads
  `decoded.role`, a claim the server never sets, so its `isSuperAdmin` branch
  is always false. This is an existing frontend defect, not something the port
  changes; it is listed in the Stage 1 findings for a separate fix.
- **Cookies:** names from `COOKIE_NAMES`. `Secure` + `SameSite=None` in
  production, `Lax` in dev (`cookie.util.crossSiteCookiePolicy`). They are
  cleared with the exact same attributes.
- **CSRF:** double-submit, **plus a signed header path for cookieless iPhones**
  (HMAC-SHA256 keyed from `JWT_SECRET`, base64url). Bearer-authenticated
  requests and safe methods are exempt. The client retries once on
  `CSRF_TOKEN_INVALID` / `CSRF_TOKEN_MISSING`, so the error codes are part of
  the contract.
- **Refresh rotation** with family reuse detection; the new access token keeps
  the old `competitionId`.
- **Logout** writes a durable revocation record and revokes all refresh tokens.
- **Passwords:** bcryptjs `$2a$`/`$2b$`, cost `BCRYPT_ROUNDS` (12). Spring
  Security's `BCryptPasswordEncoder` verifies both prefixes, so no re-hash is
  needed.
- **Lockout:** 5 attempts / 15 min; the message must contain the word
  "locked" (the login page matches on it).
- **OTP / reset / account-request codes:** SHA-256 hashed at rest.
- **Coach default player passwords:** AES-256-GCM via `DATA_ENCRYPTION_KEY`.
  Java must read the exact Node layout (iv / tag / ciphertext encoding), so
  Stage 3 pins it with Node-generated fixtures.
- **Authorization:** roles `player:1 coach:2 judge:3 admin:4 superadmin:5`;
  guards `requireAdmin`, `requireSuperAdmin`, `requireAdminOrScorer`,
  `requireRole(...)`, `requireJudge`, `requireSequenceManager`; plus
  **competition scope** (`validateCompetitionContext`: admins are scoped to
  their meets, coaches deliberately exempt) and the **end-date lock**
  (frozen at 23:59 UTC on the end date, superadmin-only writes, answers
  **423**, with four surfaces left open on purpose). A judge's role is
  resolved **per seat, per category, per apparatus**, never from the body;
  the one carve-out is the genuine Senior Judge override.
- **Rate limits:** no global or per-IP limiter (a venue NAT puts a whole panel
  behind one IP). `authLimiter` per-IP on guessable endpoints only;
  `userLimiter` per principal on `/players`, `/coaches`, `/competitions`,
  `/teams`; `judgeLoginLimiter` per submitted email; per-account limits from
  the 2026-10-31 audit.

## 6. Socket.IO inventory

Server: Socket.IO 4.7, one default namespace, **no adapter (single
instance)**, `pingTimeout 5000`, `pingInterval 25000`, CORS whitelist plus an
`allowRequest` Origin check. Handshake auth: `auth.token`, else the
`access_token` cookie (the role cookie is chosen by `auth.userType`, sent as
`x-user-type`). Then the logout check and the `isActive` check.

Client: `socket.io-client` 4.7 in 9 files, all `io(url, { auth: { token },
withCredentials: true })`. Default transports (polling, then upgrade to
WebSocket). **No acknowledgements, no binary payloads, no custom namespaces,
no custom path.** That is the narrow feature set the Java server has to
cover. Full event table: [03-REALTIME.md](03-REALTIME.md#event-compatibility-matrix).

Rooms: `scoring_{gender}_{ageGroup}_{competitionType}` in **two forms**
(slug and display; display values matched longest-first) and
`competition_{id}` (auto-joined from the JWT claim). The `team_*` rooms are
never joined. Authorization to join comes from the judge's seats, cached on
the socket at connect.

## 7. Other integrations and background work

| Concern | Today | Java |
|---|---|---|
| Razorpay | `razorpay` SDK: create order, verify checkout HMAC, webhook HMAC over raw body, idempotent Transaction (migration 011), webhook-first race on the walk-in desk | A thin `RestClient` (3 calls; the SDK is not used, see 02 §5); HMAC via `javax.crypto`; raw body read before JSON binding |
| Email | provider switch: `gmail-api` (prod; Render blocked SMTP), `nodemailer` SMTP, `resend`, `none` | `EmailSender` interface with 4 implementations; templates ported to Thymeleaf text/HTML or kept as string builders |
| OCR | HTTP to `ocr/` sidecar, bearer `OCR_TOKEN`, 60 s timeout | `RestClient` with timeouts; sidecar unchanged |
| PDF | `pdfkit` paper form; `qrcode` | Apache PDFBox 3 + ZXing; byte-level parity not required, **layout parity** is (OCR reads the boxes by coordinates from `form-layout.util.js`) |
| Cache | in-process LRU+TTL `Map` (300 s, 1,000 entries) + `wrap()` | Caffeine via Spring Cache. No Redis |
| Request coalescing | collapses identical concurrent GETs per caller | Port **only if** Stage 7 load tests show a need (YAGNI); the key must hash the raw credential, never `req.user` |
| Token invalidation | Redis if `REDIS_URL`, else memory; plus durable `SessionRevocation` | Mongo-backed `SessionRevocation` + Caffeine. Production runs one active instance, so no Redis (ADR-006) |
| Timers | `competition-status` midnight sweep (self-rescheduling `setTimeout`); OTP and reset-token cleanup `setInterval`s; Render keep-alive pinger | `@Scheduled` with a bounded scheduler. Keep-alive is dropped (Render is retired) |
| Migrations | own runner, `migrations` collection, 001–016 applied; index reconciliation from schemas at startup | Java does **not** re-run 001–016. A small runner continues the same collection for 017+. Index declarations ported 1:1 and reconciled at startup (ADR-008) |
| Metrics | `prom-client`: HTTP, Socket.IO, Mongo, `app_info{version}` scraped by Grafana Alloy | Micrometer Prometheus registry with **the same metric names and labels**, so the 4 Grafana dashboards and 29 alert rules keep working (05 §6) |
| Logs | Winston JSON + daily rotate, correlation id | Logback JSON (logstash encoder), MDC correlation id, same field names |

## 8. Technical debt carried by the Node code (do not port these)

| # | Debt | Evidence | What Java does instead |
|---|---|---|---|
| T1 | **God services.** `scoring.service` 2,153 lines, `admin.service` 2,070, `coach.service` 1,604, `super-admin.service` 1,286 | file sizes | Split by use case inside each module (02 §3) |
| T2 | **Two-phase socket injection.** A service missing from a hardcoded list silently never broadcasts | `bootstrap.js` `servicesNeedingSocket` | Services depend on a `RealtimePublisher` interface, injected by the constructor like anything else |
| T3 | **Rules split across `config/`, `utils/`, services and `scripts/lib`.** Panel composition (`EVALUATION_SEATS`, `seatsFor`) lives in `scripts/lib/panel-plan.js`, which the server cannot reach | engine inventory | Six pure engines in `domain` packages (02 §4) |
| T4 | **The server trusts a client-computed slip total.** It range-checks the total against section ceilings but never recomputes it | `scoring.validator`, engine inventory | **Behaviour preserved in the port** (D: no new rules). Fixing it is a separate, approved change once Java is live |
| T5 | **Two team-ranking implementations, and the wrong one is wired.** `getTeamRankings` → `calculateRankings` (no tie-break) | engine inventory | Port the behaviour as-is; record it as a known divergence. Fixing it is a separate approved change |
| T6 | Category naming copied 3 times (`cop-rules`, `socket.manager`, `scoring.handler`; I–III vs I–V) | engine inventory | One `CompetitionType` enum with slug and display forms |
| T7 | Read-modify-`.save()` on `registeredTeams` in `addTeam` / `updateRegistration` (lost updates) | GOTCHAS | All embedded writes go through atomic team-addressed updates |
| T8 | `addPlayer` "transaction" doesn't cover the Player insert (the repository drops the session) | GOTCHAS | Either a real transaction (the replica set supports it) or the walk-in desk's resumable design. Decided per use case |
| T9 | `getSuperAdminDashboard` N+1 over competitions | GOTCHAS | One aggregation |
| T10 | Graceful shutdown doesn't really drain in-flight requests | GOTCHAS | `server.shutdown=graceful` + a timeout |
| T11 | Dead code: `NotificationHandler`'s 5 outbound helpers, `team_*` rooms, `tieBreakResolution` schema never written, `/api/scoring` (deleted), `POST /admin/age-groups/:ageGroup/end` always 404 | 08-REALTIME, api-known-defects | Not ported. The always-404 route is listed in the compatibility matrix as "kept answering 404" |
| T12 | `toJSON` transforms are not a safety net (`.lean()` everywhere), so PII leaks recurred in hand-built mappings (CRIT-4 class, 7 instances fixed) | known-gotchas | Explicit response DTOs per endpoint. **The DTOs are the allow-list**, and contract tests assert the forbidden fields are absent |
| T13 | Two writers of `paymentStatus` (registration service + webhook) | GOTCHAS | One `PaymentStatusTransition` in the payment module, called by both |
| T14 | `AuditLog.adminId` populate without `ref` | GOTCHAS | Explicit lookup |
| T15 | express-validator chains duplicated across validators | 2,850 lines | Bean Validation on request DTOs + a few custom constraints |
| T16 | **No single source for the vocabulary.** 77 enum fields across 18 models with drifting lists (two AgeGroup sets, slug vs display competition type, `Team.sex`, three user-type lists); `'superadmin'` ×64, `'competition_1'` ×37, `'Pole Mallakhamb'` ×25; 49 role checks by string; 65 HTTP status literals; 24 `toFixed`; 229 direct clock reads; 17 stray `process.env`; an incomplete `error-codes.js` | measured 2026-11-12, 08 §1 | The shared kernel and catalogues (08): one enum, id, value object or catalogue entry per concept, enforced by `SingleSourceTest` |

## 9. Security assessment (relevant to the port)

The 2026-10-31 audit fixes are live. The port must **not regress** any of them:

- No PII in responses beyond the allow-lists (`user-projection.util.js`).
  The DTOs replace those, and a contract test per endpoint checks forbidden keys (`password`, `resetPassword*`, `email`/`dateOfBirth` of minors to judges or anonymous callers, `loginAttempts`, `lockUntil`, encrypted passwords).
- `express-mongo-sanitize` strips `$` and `.` keys. **Java equivalent:** never
  build queries from raw maps; bind typed DTOs and use `Criteria` with values.
  Reject keys starting with `$` in the few `Map` inputs.
- Helmet headers and CSP nonce. The API serves JSON, so CSP matters little
  there; port the header set exactly so `deploy/oci` security checks still pass.
- HSTS, HTTPS redirect behind the proxy (`X-Forwarded-Proto`), 1 MB JSON limit,
  image upload limit on the walk-in desk.
- Webhook: constant-time HMAC compare, raw body, `RAZORPAY_WEBHOOK_SECRET` with a key-secret fallback.
- The metrics endpoint is behind a token. Docs and debug routes are never on in production.
- The socket Origin check (`allowRequest`) and the refusal of inactive accounts.

New risks the port creates (and how they are handled):

| Risk | Mitigation |
|---|---|
| Spring Security defaults (session creation, its own CSRF, form login) conflict with the existing contract | Stateless, Spring CSRF **off**, the project's own CSRF filter ported; explicit `SecurityFilterChain` |
| Jackson leaks entity fields | DTO-only responses; ArchUnit rule: no `@Document` class in a controller signature |
| Spring Boot Actuator exposes too much | Only `health` and `prometheus` exposed, on the internal port, behind the existing metrics token |
| Error responses leak stack traces | One `@RestControllerAdvice` producing the existing envelope; `server.error.include-*=never` |
| Deserialising polymorphic or Mixed payloads | No default typing; `FAIL_ON_UNKNOWN_PROPERTIES=false` (matches Express) but no type info accepted |

## 10. Performance baseline

Already measured: `Server/docs/api-performance.md`, `perf-report*.json`,
`perf-queries*.json` (round trips per request), and the e2e latency stat in
Grafana since 2026-10-27. **Stage 1 re-records the baseline** on the OCI VM
shape (A1, 1 OCPU, 4 GB) with `scripts/perf/benchmarkApi.js` and
`countQueries.js`, so the Java numbers are compared like for like.

Known hot paths: `POST /api/public/save-score` (busiest write, retry loop under
contention), judge dashboard and team-player reads (aggregations over
`registeredTeams`), public scores, the admin scoring sheet. Expectation, to be
checked against measurements: Java will not be faster on Mongo-bound requests.
The gains to look for are CPU-bound ranking on large categories and steadier
p99 under concurrency. **The memory budget is the real constraint** (05 §2).

## 11. Principles assessment of the current code

| Principle | Verdict | Evidence |
|---|---|---|
| Separation of concerns | Mostly good | Clean route→controller→service→repo layering; violated by the god services and by controllers that resolve seats (deliberate: authorization) |
| DRY | Improved, still leaky | `judge-slip.util` and `scoring-room.util` are single sources now; category naming ×3, `ageGroup===X && gender===Y` ×4, COP rules ×2 (server + Web mirror, drift-detected) |
| KISS / YAGNI | Mixed | A hand-rolled DI container, request coalescing, a 3-adapter email abstraction (justified), Redis plumbing nobody turns on, a keep-alive pinger for a platform being retired |
| SRP / high cohesion | Weak in 5 services | T1 |
| Loose coupling | Medium | `adminService` delegates to `scoringService`/`judgePanelService` through getters; `publicService` depends on `adminService` |
| Law of Demeter | Weak around `registeredTeams` | Callers navigate `competition.registeredTeams[i].players[j].apparatus` directly |
| Encapsulation | Weak | Plain lean objects everywhere; schema invariants enforced in random services |
| Abstraction / DIP | Good where it matters | Email provider interface, Razorpay gateway module, repositories |

## 12. Migration risks and compatibility concerns

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Scoring arithmetic differs** (double rounding, `toFixed` vs `HALF_UP`, `Math.round` on negatives) | High if untested | Wrong results that look believable | Golden vectors generated from the JS engine (≥ 100k property-based cases + all worked examples). `BigDecimal(new BigDecimal(double))` with exact `toFixed` semantics in one `JsNumber` helper (04 §3) |
| R2 | JSON shape drift (`_id` vs `id`, null vs absent keys, date format, number formatting such as `9` vs `9.0`, Map key order) | High | Frontend breaks quietly | Differential replay of every route against Node on the same DB snapshot; normaliser only ignores timestamps and ids (04 §2) |
| R3 | Socket.IO library gaps (polling→upgrade, cookie handshake, Origin check, two-form rooms, `withCredentials` CORS) | Medium | Live scoring breaks at a meet | Library chosen on exactly these features; real Web screens + `socket.io-client` contract tests; meet-day simulation before cutover |
| R4 | Concurrency on `Score` (lost slips) | Medium | Lost judge marks | Same `__v` guard, same merge, same retry bounds; concurrent-writer test with 6 judges × 50 athletes |
| R5 | JVM memory on 4 GB VMs that also run mongod, OCR, Alloy, Caddy and the nightly e2e mongod | Medium | OOM kill on meet day | Heap and RSS budget in 05 §2; `MemoryMax` in systemd; measured during the Stage 7 soak |
| R6 | Ops scripts and the Mongoose models drift from the Java mappings once Java owns the schema | Medium | Seed and setup chains write shapes Java can't read | ADR-009: schema is frozen across both until the scripts are retired; a schema test runs the Node seed then reads everything through Java |
| R7 | Mixed Node/Java writes during rollback leave docs in a shape the other can't read | Low | Rollback fails | Java writes Mongoose-compatible docs (`__v`, timestamps); rollback drill in Stage 7 writes with Java, rolls back, reads with Node |
| R8 | Long build, Node keeps changing during it | High | Port chases a moving target | **Node changes during the port are limited to bug fixes**; each one lands with a contract-corpus update, and the corpus diff tells the Java side what to re-port (06 §6) |
| R9 | Agent-built code that isn't really understood | Medium | Maintainability | ArchUnit rules, small modules, ADRs, a review pass per module (06 §4), and the owner reads every module's README |
