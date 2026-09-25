---
doc: 02-CONVENTIONS
covers:
  - src/errors/**
  - src/middleware/error.middleware.js
  - src/middleware/validation.middleware.js
read_when: "writing a new controller/service, deciding what error to throw, or following the response-envelope shape"
depends_on: [01-ARCHITECTURE]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Layer naming

`*.routes.js` (Express router factories, `createXRoutes(container)`) →
`*.controller.js` (mostly `createXController(container)` factories
returning a handler object — `team.routes.js` and `scoring.routes.js` are
the two exceptions, see below) → `*.service.js` (business logic) →
`*.repository.js` (Mongoose query layer, `extends BaseRepository`) →
`src/models/*.js` (schemas, PascalCase filenames matching the model name).
Validators live in `*.validator.js`, one per domain, reusing
`common.validator.js` helpers. Utilities are split by concern under
`src/utils/{auth,data,scoring,security,validation}/`.

**Two deliberate exceptions to the controller-factory pattern**:
`scoring.routes.js` has no `scoringController` file — handlers are inline
`asyncHandler` closures calling `scoringService` directly. `team.routes.js`
exports a dual-mode function (callable as Express middleware directly, or as
the `createTeamRoutes` factory) — every other route file exports only the
factory.

## Response envelope

Success: `{ success: true, data: <payload>, message?: <string> }`. A few
older controllers (`team.controller.js`) also spread a legacy top-level
alias key (`teams=`/`team=`/`stats=`) alongside `data` for backward
compatibility — don't propagate that pattern to new code, it's a
historical artifact, not the standard.

Error (from `errorHandler`, `src/middleware/error.middleware.js`):
```json
{ "success": false, "error": { "message": "...", "code": "...", "correlationId": "...", "details"?: {...} } }
```
`details` is only included for operational errors that carry them
(validation field errors, business-rule specifics). In production, a 5xx's
`message` is replaced with a generic string and `details` is dropped;
`stack`/`name` are only ever included when `NODE_ENV==='development'`.
`sanitizeErrorMessage` additionally strips file paths, emails, long
hex/token-looking strings, and IPs from any message shown outside
development, as a second line of defense.

A handful of guards in `auth.middleware.js` (`denyUnauthenticated`/
`denyForbidden`) bypass this pipeline and write `res.status(...).json(...)`
directly, rather than throwing — deliberately, because the error middleware
would rewrite `code` to a generic `AUTHENTICATION_ERROR`/
`AUTHORIZATION_ERROR` and drop fields like `requiredRoles` that the client
matches on. If you need a custom error `code` or extra fields the client
depends on, follow this direct-response pattern instead of throwing.

## Error taxonomy (`src/errors/`)

All extend `BaseError` (`message, statusCode, code, details`), which sets
`isOperational = true` and captures a stack trace. `errorHandler` treats
`isOperational` (or `err instanceof BaseError`) as "expected" — logged at
`warn` for <500, `error` for ≥500; a non-operational (programmer) error is
always logged with its stack.

| Class | Status | When to throw it |
|---|---|---|
| `ValidationError(message, details)` | 400 | Input shape/content is wrong. Usually raised automatically by `handleValidationErrors` from `express-validator` results — throw it manually only for validation that can't be expressed as a validator chain (e.g. cross-field checks needing a DB read). |
| `AuthenticationError(message)` | 401 | Who the caller is couldn't be established (bad/missing/expired token, wrong credentials). |
| `AuthorizationError(message)` | 403 | The caller is known but not permitted for this specific action. |
| `NotFoundError(resource, id?)` | 404 | A referenced document doesn't exist (or is soft-deleted, for `Competition`). |
| `ConflictError(message, details)` | 409 | The request conflicts with existing state (duplicate email, etc.) — also auto-triggered by a raw Mongo `code:11000` in the error handler. |
| `BusinessRuleError(message, details)` | 422 | The request is well-formed and the actor is permitted, but a domain rule refuses it (already approved, ageGroup/gender mismatch, still has players, etc.). |

`ERROR_CODES` (`src/errors/error-codes.js`) is a flat constants object,
grouped by the status bucket above — reuse an existing code before minting a
new one; the client matches on `error.code` in several places (notably
`IDENTITY_MISMATCH`, `COMPETITION_LOCKED`, `COMPETITION_CONTEXT_REQUIRED`,
`COMPETITION_ACCESS_DENIED` — see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)).

`423 COMPETITION_LOCKED` and the auth guards' direct-JSON responses above
are the two places this codebase intentionally departs from the
`BaseError`/`errorHandler` pipeline — both for the same reason: the error
middleware's generic rewriting would lose information a client depends on.

## `asyncHandler`

Every async route handler is wrapped in `asyncHandler(fn)`
(`error.middleware.js`) — `Promise.resolve(fn(...)).catch(next)`. Never
write a bare `try/catch` in a controller just to call `next(error)`; wrap
the whole handler instead.

## Validation

`express-validator` chains, one function per validator file, composed with
`handleValidationErrors` (`validation.middleware.js`) as the last element of
the route's middleware array. `err.path` is read (not `err.param`, which
`express-validator` 7 renamed — `err.param` is kept only as a fallback so a
downgrade doesn't silently reintroduce a bug where every field error
collided under one `"undefined"` key). `common.validator.js` is the shared
building-block file — prefer composing from it over writing a new inline
chain, but check [05-API-SURFACE.md](05-API-SURFACE.md)'s GOTCHAS notes
first: not every validator file is consistent (coach registration's inline
validator skips the password-complexity check that `common.validator.js`'s
`password()` would have enforced).

## Logging

Never call `console.*` in application code — use the injected `logger`
(`src/infrastructure/logger.js`, Winston) or, inside a request, `req.logger`
(correlation-bound, set by `correlation.middleware.js`). Every
`error/warn/info/debug/http` call runs its `meta` object through
`logger.redact()` automatically — see
[11-OBSERVABILITY.md](11-OBSERVABILITY.md) — but don't rely on that as the
only safeguard against logging a credential; prefer not putting the raw
object in `meta` in the first place.

## Naming patterns worth knowing

- **Repository methods are verbs on the model's own vocabulary**
  (`findByEmail`, `findActive`, `isEmailTaken`), not generic CRUD names —
  `BaseRepository` already supplies `findById`/`find`/`create`/`updateById`/
  `deleteById`; a repository subclass adds only what's genuinely
  model-specific.
- **`@deprecated` one-line delegates are a real, intentional pattern** in
  this codebase (see `AdminService`'s scoring/judge-panel delegates in
  [modules/user-services.md](modules/user-services.md)) — used when a large
  service is split and existing routes/callers must keep working. Don't
  "clean up" a `@deprecated` delegate without checking every caller first.
- **Two functions with almost-identical names can be genuinely different
  operations** — e.g. `ScoringService.lockScore(scoreId)` vs.
  `AdminService`'s age-group-wide `lockScores(competitionId, ageGroup,
  adminId)`. Read the full signature, not just the name, before assuming
  two calls do the same thing.

## Change guidance

- New error case: pick the narrowest class from the taxonomy above; don't
  throw a bare `Error` (it becomes a non-operational 500 with no `code`).
- New validated field: add to the relevant `*.validator.js` using
  `common.validator.js` helpers where possible; remember the route needs
  `handleValidationErrors` after the validator chain, not just the chain
  itself.
- New log statement: use the injected/contextual logger, never
  `console.log`.
