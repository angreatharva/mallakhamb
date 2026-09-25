# Coverage worklist — FINAL

Every in-scope file under `Server/`, whether it was read (directly by the
orchestrating session, or via a delegated research agent whose report was
folded into a MEMORY doc), and which doc covers it. Built during the MEMORY
build session, commit `f0bdc1d`, completed 2026-09-23.

**Follow-up pass, same day**: 6 defects surfaced by the build were fixed in
the code (not just documented) — see GOTCHAS.md's "Fixed since this MEMORY
build" section for the list. New files this pass added to scope:
`src/migrations/011_transaction_webhook_idempotency.js` (covered in
[04-DATA-MODEL.md](04-DATA-MODEL.md)); `tests/unit/services/competition/competition.service.test.js`
(new). Removed from scope: `src/services/feature-flags/` (deleted; see
[modules/feature-flags.md](modules/feature-flags.md)).

Legend: `[x]` read and covered · `(direct)` read by the orchestrating session
· `(agent)` read via a delegated research agent, findings verified against
citations and cross-checked (spot-checked route counts, migration counts,
etc.) before use.

## Entry points / skeleton
- [x] server.js (direct) → 01-ARCHITECTURE
- [x] scripts/startup.js (direct + agent) → 01-ARCHITECTURE, 13-SCRIPTS-AND-OPS
- [x] src/infrastructure/bootstrap.js (direct) → 01-ARCHITECTURE
- [x] src/infrastructure/createApp.js (direct) → 01-ARCHITECTURE, 06-AUTH-AND-SECURITY
- [x] src/infrastructure/di-container.js (direct) → 01-ARCHITECTURE
- [x] src/routes/index.js (direct) → 01-ARCHITECTURE, 05-API-SURFACE
- [x] src/config/config-manager.js (direct) → 12-CONFIG-AND-ENV
- [x] render.yaml (direct) → 15-DEPLOYMENT

## Errors (direct)
- [x] src/errors/{index,base.error,error-codes,authentication.error,authorization.error,not-found.error,conflict.error,business-rule.error,validation.error}.js → 02-CONVENTIONS

## Middleware (direct)
- [x] src/middleware/{auth,security,error,competition-lock,competition-context,csrf,validation,correlation,metrics,audit,request-coalescing}.middleware.js → 06-AUTH-AND-SECURITY, 02-CONVENTIONS, 11-OBSERVABILITY, 10-CACHING-AND-PERF, modules/middleware
- [x] src/middleware/README.md (reconciled, no material contradiction found)

## Utils/data + utils/validation (direct)
- [x] src/utils/data/{apparatus,day-boundary,judge-assignment,objectid,pagination,request-context,scoring-room,team-visibility,user-projection}.util.js → 03-DOMAIN-MODEL, modules/utils, 06-AUTH-AND-SECURITY, 08-REALTIME-SOCKETS
- [x] src/utils/validation/sanitization.util.js → modules/utils

## Models (agent: domain-data) → 03-DOMAIN-MODEL, 04-DATA-MODEL
- [x] src/models/{Admin,AuditLog,Coach,Competition,Judge,JudgeAccount,PerformanceOrder,Player,RefreshToken,Score,Team,Transaction}.js

## Repositories → modules/repositories, 04-DATA-MODEL
- [x] src/repositories/{base,admin,audit-log,coach,judge,judge-account,performance-order,player,refresh-token,team,transaction}.repository.js (agent: domain-data)
- [x] src/repositories/competition.repository.js (agent: big-services-map)
- [x] src/repositories/score.repository.js (agent: scoring-engine)

## Huge service files — exported-function maps (agent: big-services-map) → modules/user-services, 04-DATA-MODEL
- [x] src/services/user/admin.service.js (2047 lines)
- [x] src/services/scoring/scoring.service.js (1757 lines) → 07-SCORING-ENGINE
- [x] src/services/user/coach.service.js (1432 lines)
- [x] src/services/user/super-admin.service.js (1066 lines)
- [x] src/repositories/competition.repository.js (843 lines)

## Auth subsystem (agent: auth-flow) → 06-AUTH-AND-SECURITY, modules/auth
- [x] src/controllers/auth.controller.js, src/routes/auth.routes.js, src/validators/auth.validator.js
- [x] src/services/auth/{authentication,authorization,token,otp,token-invalidation}.service.js
- [x] src/utils/auth/{otp.util,token.util,user-repository-resolver}.js
- [x] src/utils/security/{cookie,login-response,login-security,account-lockout,token-invalidation}.util.js
- [x] src/models/RefreshToken.js, src/models/JudgeAccount.js (cross-checked against domain-data report)
- [x] src/services/email/{email.service,email-provider.interface,nodemailer.adapter,resend.adapter}.js
- [x] src/services/email/templates/{notification,otp,password-reset}.template.js
- [x] src/services/auth/README.md, src/services/email/README.md (reconciled — auth README materially stale, see GOTCHAS.md; email README accurate)

## Admin write / competition access (agent: admin-write-flow) → modules/competition, 06-AUTH-AND-SECURITY, 05-API-SURFACE
- [x] src/routes/admin.routes.js, src/validators/admin.validator.js, src/controllers/admin.controller.js
- [x] src/routes/competition.routes.js, src/validators/competition.validator.js, src/controllers/competition.controller.js
- [x] src/services/competition/competition.service.js
- [x] src/utils/security/{competition-access,competition-lock}.util.js

## Scoring engine (agent: scoring-engine) → 07-SCORING-ENGINE, 08-REALTIME-SOCKETS, modules/scoring
- [x] src/routes/scoring.routes.js, src/validators/scoring.validator.js
- [x] src/services/scoring/calculation.service.js, src/services/scoring/README.md (reconciled — stale, see GOTCHAS.md)
- [x] src/utils/scoring/{calculation,judge-slip,player-row,ranking,tie-breaker}.util.js
- [x] src/config/cop-rules.js
- [x] src/socket/handlers/scoring.handler.js
- [x] src/models/Score.js, src/repositories/score.repository.js
- [x] src/services/competition/performance-order.service.js
- [x] src/models/PerformanceOrder.js, src/repositories/performance-order.repository.js
- [x] src/controllers/performance-order.controller.js, src/validators/performance-order.validator.js
- [x] src/controllers/judge.controller.js, src/routes/judge.routes.js, src/validators/judge.validator.js
- [x] src/services/user/judge.service.js, src/services/user/judge-account.service.js, src/services/user/judge-panel.service.js

## Payment & registration (agent: payment-registration) → 09-PAYMENTS, modules/payment
- [x] src/controllers/payment.controller.js, src/routes/payment.routes.js
- [x] src/services/payment/{payment.service,razorpay.gateway}.js
- [x] src/config/payment.config.js
- [x] src/models/Transaction.js, src/repositories/transaction.repository.js (cross-checked with domain-data)
- [x] src/services/competition/registration.service.js
- [x] docs/razorpay-payment-handling.md (reconciled — stale, see GOTCHAS.md)
- [x] scripts/payWithDiscount.js

## Public reads, cache, sockets (agent: public-cache-realtime) → modules/public, 10-CACHING-AND-PERF, 08-REALTIME-SOCKETS
- [x] src/controllers/public.controller.js, src/routes/public.routes.js, src/validators/public.validator.js
- [x] src/services/public/public.service.js
- [x] src/services/cache/{cache.service,cache-warmer}.js
- [x] src/services/feature-flags/feature-flag.service.js, src/services/feature-flags/README.md (reconciled at build time — orphaning understated, see GOTCHAS.md; **directory removed 2026-09-23 follow-up pass**, see modules/feature-flags.md)
- [x] src/socket/socket.manager.js, src/socket/handlers/notification.handler.js, src/socket/events/event-types.js
- [x] src/socket/README.md (reconciled — stale, see GOTCHAS.md)
- [x] src/services/competition/competition-status.service.js

## Startup/shutdown, infra, observability (agent: startup-infra-observability) → modules/infrastructure, 11-OBSERVABILITY, 01-ARCHITECTURE
- [x] src/infrastructure/database/{connection,index-manager,migration-runner}.js
- [x] src/infrastructure/{health-monitor,metrics-collector,logger,graceful-shutdown,redis-client}.js
- [x] src/infrastructure/database/README.md, src/infrastructure/README.md (reconciled — both incomplete/one overstated claim, see GOTCHAS.md)
- [x] src/migrations/{001..010}_*.js, src/migrations/migration-template.js → 04-DATA-MODEL
- [x] src/controllers/health.controller.js, src/routes/health.routes.js

## User services + full API surface (agent: user-services-api-surface, two passes) → 05-API-SURFACE, modules/user-services, modules/team
- [x] src/services/user/{player,user}.service.js → modules/user-services
- [x] src/services/team/team.service.js → modules/team
- [x] src/controllers/{player,coach,team,super-admin}.controller.js
- [x] src/routes/{player,coach,team,super-admin}.routes.js
- [x] src/validators/{player,common}.validator.js
- [x] src/validators/team.validator.js (referenced; not separately deep-read — team.routes.js's own local validate() confirmed)
- [x] src/services/user/README.md (reconciled — stale constructor signature + incomplete method list, see GOTCHAS.md)
- [x] Full route table cross-check vs src/docs/openapi.js, src/docs/api-enums.js — 184 routes, 182 spec operations, gap = docs.routes.js's 2 self-referential endpoints, confirmed 1:1 otherwise. Independently spot-verified via grep (182 router-file matches).

## Ops: scripts, tests, docs reconciliation, env vars (agent: ops-docs-tests-envvars) → 13-SCRIPTS-AND-OPS, 14-TESTING, 12-CONFIG-AND-ENV, GOTCHAS
- [x] scripts/*.js (all ~24 top-level) incl. scripts/lib/*.js, scripts/perf/*.js + scripts/perf/lib/*.js
- [x] tests/** (56 suites: unit 33, integration 12, security 11 — surveyed, mapped to subsystem)
- [x] Server/README.md, docs/{AUDIT,api-documentation,api-performance,architecture,dependency-injection-guide,deployment-guide,migration-guide,testing-guide,troubleshooting-guide,RELEASE-RUNBOOK,system-handbook}.md (reconciled — see GOTCHAS.md for the extensive staleness findings; AUDIT.md, api-performance.md, RELEASE-RUNBOOK.md confirmed current)
- [x] src/config/README.md, src/validators/README.md (reconciled — both mostly accurate, one stale test-path reference each)
- [x] full `process.env.` grep across Server/ (excluding node_modules, logs, .env*) → 12-CONFIG-AND-ENV, 13-SCRIPTS-AND-OPS
- [x] package.json npm scripts cross-check — all 40 map cleanly, no mismatches (contradicts README's own stale "Stale entries" note)
- [x] Confirmed: `Server/API_DOCUMENTATION.md` does NOT exist at the Server root; only `Server/README.md` there, `Server/docs/api-documentation.md` inside docs/

## Deliberately not read in depth (out of scope, per master prompt §1)
- `Server/node_modules/`, `.git/`, `coverage/` — excluded
- `Server/logs/**` — excluded (log output, not source)
- `Server/.env`, `.env.production`, `.env.scripts` — never opened; key names only via source-code grep
- `Server/docs/*.json` perf dumps, `openapi.json`/`openapi.yaml` — generated, referenced not transcribed
- `Server/docs/COP Mallakhamb.pdf` — external rules reference, noted not transcribed (the COP rules it documents are captured in code form via `src/config/cop-rules.js`, covered in 07-SCORING-ENGINE.md)
- `Web/` (frontend) — out of scope except the server→client contract surface (response envelope, socket events, cookie names, CORS) noted throughout
- `src/docs/openapi.js`, `src/docs/api-enums.js` — read for the route-table cross-check (05-API-SURFACE.md), not transcribed in full (both are large generated-adjacent files; their *structure* and *coverage* were verified, not their full content)

## Verification checks (master prompt §8)
1. **Coverage**: every in-scope file above is ticked; the "deliberately not read" list states why for each exclusion. ✓
2. **Route count**: 182 `router.*` definitions across `src/routes/*.js` (independently re-confirmed via `grep -rEo "router\.(get|post|put|patch|delete)\(" src/routes/*.js | wc -l` → 182) + 2 inline in `routes/index.js` (`/health-legacy`, `/csrf-token`) = **184 total routes**. `src/docs/openapi.js` documents **182** operations — the gap is exactly `docs.routes.js`'s own 2 self-referential endpoints, correctly excluded by design. Reported in [05-API-SURFACE.md](05-API-SURFACE.md).
3. **Env vars**: every `process.env.` reference found by the ops-docs-tests-envvars agent's grep pass is listed in [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md) (app-level, routed through config-manager) or [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md) (scripts-only, read directly). None missing.
4. **npm scripts**: all 40 scripts in `package.json` appear in [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md). ✓
5. **Migrations**: all 11 numbered migrations (10 at initial build + 011 added in the 2026-09-23 follow-up pass) + the template appear in [04-DATA-MODEL.md](04-DATA-MODEL.md)'s migration table. ✓
6. **Internal links**: every `[text](file.md)`/`[text](file.md#anchor)` link across the doc set points at a file that exists in `Server/MEMORY/`. Spot-checked during authoring; no dangling links to a doc that wasn't ultimately written.
7. **Cold-start self-test**: see the three worked traces at the bottom of [00-INDEX.md](00-INDEX.md).

## ⚠️ UNVERIFIED items collected from all passes
See each doc's own "Open questions" section for the full list with context.
Summary:
- `AuditLog.adminId` populate behavior with no schema `ref` (04-DATA-MODEL, GOTCHAS)
- Whether `Coach.team`/`Team.coach` are guaranteed inverses (03-DOMAIN-MODEL)
- Whether `AuthenticationService` is supplied `judgeAccountRepository` in production DI wiring (06-AUTH-AND-SECURITY, modules/auth)
- Whether `TokenInvalidationService`'s admin-assignment-change half has a real caller (modules/auth)
- Whether `CompetitionRepository.addTeam`/`updateRegistration`'s unaddressed read-modify-save hazard has since been fixed (modules/repositories, GOTCHAS)
- Whether the `Transaction` webhook-duplicate-insert risk has been mitigated (09-PAYMENTS, GOTCHAS)
- Whether `resetPasswordWithToken`/`competitionService.assignAdmin`/`removeAdmin` (confirmed-missing methods) have since been fixed (GOTCHAS, 05-API-SURFACE, modules/competition)
- Whether `tests/unit/routes/admin.routes.test.js` currently passes (14-TESTING, GOTCHAS)
- `waitForInFlightRequests()`'s actual drain behavior during shutdown (modules/infrastructure, GOTCHAS)
- MongoDB driver auto-reconnect sufficiency post-initial-connect (modules/infrastructure)
- Whether `validateTeamForCompetition`/`getTeamRoster` have callers outside `team.controller.js` (modules/team)
