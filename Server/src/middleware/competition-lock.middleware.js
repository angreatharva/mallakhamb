/**
 * Competition Lock Middleware
 *
 * Refuses any WRITE aimed at a competition that has passed 23:59 UTC on its
 * `endDate`. The rule itself — the boundary, the superadmin exemption, the
 * status code — lives in `utils/security/competition-lock.util`; this file is
 * only the Express plumbing that resolves which meet a request is about and
 * turns a `true` into a response.
 *
 * ── Where it is mounted ────────────────────────────────────────────────────
 *
 * On individual mutating routes, explicitly, after that route's own auth and
 * `validateCompetitionContext`. NOT as a blanket `router.use`, and not folded
 * into the auth middleware, for two reasons:
 *
 *  - `router.use(guard)` at the top of a router runs BEFORE the per-route
 *    `authMiddleware` these routers use, so `req.user` would not exist yet and
 *    the superadmin exemption could not be applied.
 *  - Folding it into `createAuthMiddleware` would catch every authenticated
 *    write, including ones that are not competition data at all. A judge whose
 *    token names last month's meet would be unable to change their own
 *    PASSWORD. An account is not a competition.
 *
 * So each write says out loud that it is competition data. Grep for
 * `requireUnlockedCompetition` to see the full set.
 *
 * ── What is deliberately NOT behind it ─────────────────────────────────────
 *
 *  - Every `/api/superadmin/*` route. That router is the exemption.
 *  - Reads. The guard short-circuits on GET/HEAD/OPTIONS anyway, but they are
 *    not mounted with it either: a locked meet must stay fully readable, which
 *    is the entire point of freezing results rather than hiding them.
 *  - Login, registration and profile/password routes — identity, not results.
 *  - `POST /api/public/payments/razorpay/webhook`. Razorpay is not a user, and
 *    that callback is how an already-taken payment gets recorded. Refusing it
 *    would not stop the money moving; it would only lose the record of it, and
 *    Razorpay would keep retrying a request designed to be idempotent. The
 *    coach-facing side of payment IS locked (order creation, verify-and-submit,
 *    discount redemption), so nothing new can enter the window after close —
 *    only the reconciliation of something that already did.
 *
 * @module middleware/competition-lock.middleware
 */

const { competitionIdFromRequest } = require('../utils/data/request-context.util');
const {
  LOCKED_STATUS,
  LOCKED_CODE,
  describeCompetitionLock,
  mayBypassCompetitionLock,
} = require('../utils/security/competition-lock.util');

/** Methods that cannot change anything, and so are never refused. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Build the lock guard factory for an app.
 *
 * @param {Object} container - DI container
 * @returns {Function} `requireUnlockedCompetition(options?)` → Express middleware
 */
function createCompetitionLockGuard(container) {
  /**
   * Resolved defensively, exactly as `auth.middleware` resolves
   * `judgeRepository`: several harnesses build a minimal container whose
   * `resolve` answers `{}` for anything it does not know about, and a router
   * must not fail to BUILD because of that.
   *
   * @param {string} name
   * @returns {Object|null} the dependency, or null when it is not usable
   */
  const readable = (name) => {
    try {
      const resolved = container.resolve(name);
      return typeof resolved?.findById === 'function' ? resolved : null;
    } catch {
      return null;
    }
  };

  const competitionRepository = readable('competitionRepository');
  const scoreRepository = readable('scoreRepository');

  let logger;
  try {
    logger = container.resolve('logger');
  } catch {
    logger = null;
  }
  const log = (level, ...args) => {
    if (typeof logger?.[level] === 'function') logger[level](...args);
  };

  /*
   * No competition repository means the lock cannot be evaluated AT ALL, so
   * every guard this factory returns is inert.
   *
   * That is a wiring fact, not a per-request condition: `bootstrap.js` always
   * registers `competitionRepository`, so in a real app this branch is dead and
   * the guard is always live. Failing CLOSED here instead would mean a single
   * missing registration answers 423 to every write in the product, which is a
   * far worse failure than the one it would be guarding against — and it would
   * be indistinguishable from a genuinely closed meet.
   *
   * Announced at WARN, once per router, so a misconfigured deployment says so
   * in the logs on boot rather than quietly running without the lock. Note this
   * is NOT the same as a read that FAILS mid-request: that surfaces as a 500 and
   * the write is refused (see the catch below).
   */
  if (!competitionRepository) {
    log('warn', 'Competition lock: no usable competitionRepository, end-date lock is INACTIVE');
    return () => (req, res, next) => next();
  }

  /**
   * The competition a request is aimed at.
   *
   * Three shapes, because the routes that write competition data name their
   * meet in three different places:
   *
   *   - most of them leave it to `competitionIdFromRequest` (token, the
   *     `x-competition-id` header, body or query — the chain every controller
   *     already uses);
   *   - `/api/competitions/:id/...` puts it in a ROUTE PARAM, which that shared
   *     chain deliberately does not read (`:id` means something different on
   *     every other router, so reading it there would be wrong more often than
   *     right);
   *   - `/api/scoring/:scoreId` names a SCORE, and the meet is a field on it.
   *
   * @param {import('express').Request} req
   * @param {{param?: string, scoreParam?: string}} options
   * @returns {Promise<*>} competition id, or undefined
   */
  async function resolveCompetitionId(req, options) {
    if (options.param) {
      const fromParam = req.params?.[options.param];
      if (fromParam) return fromParam;
    }

    if (options.scoreParam && scoreRepository) {
      const scoreId = req.params?.[options.scoreParam];
      if (scoreId) {
        const score = await scoreRepository.findById(scoreId, { select: 'competition' });
        if (score?.competition) return score.competition;
      }
    }

    return competitionIdFromRequest(req);
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.param] - route param holding the competition id
   * @param {string} [options.scoreParam] - route param holding a SCORE id, whose
   *   `competition` field names the meet
   * @returns {Function} Express middleware
   */
  return function requireUnlockedCompetition(options = {}) {
    return async (req, res, next) => {
      try {
        if (SAFE_METHODS.has(req.method)) return next();

        // The exemption, checked before the lookup so a superadmin never pays
        // for a query they cannot be refused by.
        if (mayBypassCompetitionLock(req.user, req.userType)) return next();

        const competitionId = await resolveCompetitionId(req, options);

        /*
         * Two fall-open cases, both of which hand the request to the route that
         * knows how to reject it properly.
         *
         * No id: the handler needs the competition too, and will answer its own
         * 400 (`COMPETITION_CONTEXT_REQUIRED`) or 404. Refusing here would mean
         * a request with no competition at all gets told a competition is
         * locked, which is a worse answer than no answer.
         *
         * No such competition: a bad or soft-deleted id. That is a 404 the
         * handler already produces, and a 423 would be a lie about a record
         * that does not exist.
         *
         * Neither case weakens the lock: a write that reaches a real, frozen
         * competition still has to get past the check below, and every access
         * rule in `competition-access.util` applies independently of this one.
         */
        if (!competitionId) {
          log('debug', 'Competition lock: no competition on request, deferring to handler', {
            path: req.path,
            method: req.method,
          });
          return next();
        }

        const competition = await competitionRepository.findById(competitionId, {
          select: 'name endDate status',
        });

        if (!competition) {
          log('debug', 'Competition lock: competition not found, deferring to handler', {
            competitionId: String(competitionId),
            path: req.path,
          });
          return next();
        }

        const lock = describeCompetitionLock(competition);
        if (!lock.locked) return next();

        log('warn', 'Competition lock: write refused, competition has closed', {
          competitionId: String(competitionId),
          competitionName: competition.name,
          lockedSince: lock.locksAt?.toISOString(),
          userId: req.user?._id ? String(req.user._id) : null,
          userType: req.userType,
          method: req.method,
          path: req.originalUrl,
        });

        return res.status(LOCKED_STATUS).json({
          success: false,
          message: lock.message,
          error: {
            message: lock.message,
            code: LOCKED_CODE,
            competitionId: String(competitionId),
            lockedAt: lock.locksAt ? lock.locksAt.toISOString() : null,
          },
        });
      } catch (error) {
        /*
         * A failed lookup is NOT an allow. The competition might well be locked
         * and we simply could not read it; letting the write through on a
         * database error would make the lock bypassable by whatever made the
         * read fail. Handed to the error middleware as a 500.
         */
        return next(error);
      }
    };
  };
}

module.exports = {
  createCompetitionLockGuard,
  SAFE_METHODS,
};
