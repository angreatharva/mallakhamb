/**
 * Authentication Middleware
 * 
 * Refactored to use AuthenticationService and TokenService.
 * Validates JWT tokens, loads user context, and performs token rotation
 * for long-lived sessions (Requirement 17.7).
 *
 * Phase 2A changes:
 *  - Extracts access token from httpOnly cookie (preferred) or Authorization header (fallback)
 *  - Token rotation sets a new httpOnly cookie instead of X-New-Token header
 *  - isTokenLoggedOut is now awaited (async for Redis support)
 * 
 * Requirements: 1.2, 13.3, 17.7, 19.1, HIGH-3 (Phase 2A, Item 2.1)
 */

const { AuthenticationError } = require('../errors');
const { isTokenLoggedOut } = require('../utils/security/token-invalidation.util');
const { COOKIE_NAMES, isProductionLike, setAccessTokenCookie } = require('../utils/security/cookie.util');
const {
  loadAssignments,
  hasAnyRole,
  SEQUENCE_JUDGE_TYPES,
} = require('../utils/data/judge-assignment.util');

/**
 * Create authentication middleware
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createAuthMiddleware(container) {
  const tokenService = container.resolve('tokenService');
  const authenticationService = container.resolve('authenticationService');
  const logger = container.resolve('logger');
  // Judge panel assignments. Resolved defensively: several test harnesses build
  // a minimal container, and a judge with no resolvable assignments must fail
  // closed (no roles) rather than blow up the whole middleware.
  let judgeRepository = null;
  try {
    judgeRepository = container.resolve('judgeRepository');
  } catch {
    judgeRepository = null;
  }
  const config = container.resolve('config');
  const isProduction = isProductionLike(config);

  return async (req, res, next) => {
    try {
      // --- Extract token ---
      // Priority: httpOnly cookie > Authorization header
      let token = null;
      let tokenSource = 'none';

      // 1. Try httpOnly cookie
      if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
        token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
        tokenSource = 'cookie';
      }

      // 2. Fallback to Authorization header (backward compat for mobile / Postman / tests)
      if (!token) {
        const authHeader = req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.replace('Bearer ', '');
          tokenSource = 'header';
        }
      }

      if (!token) {
        logger.warn('Authentication failed: No token provided', {
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        return res.status(401).json({ 
          success: false,
          message: 'No token, authorization denied',
          error: {
            message: 'No token, authorization denied',
            code: 'NO_TOKEN'
          }
        });
      }

      // Backward-compatibility support for integration tests that rely on a
      // synthetic token value and mocked auth context.
      // Requires BOTH NODE_ENV=test AND explicit ALLOW_TEST_TOKEN=true.
      if (
        process.env.NODE_ENV === 'test' &&
        process.env.ALLOW_TEST_TOKEN === 'true' &&
        token === 'test-token'
      ) {
        req.user = req.user || { _id: 'user-test-id' };
        req.userType = req.userType || req.headers['x-user-type'] || 'admin';
        return next();
      }

      // Verify token using TokenService
      let decoded;
      try {
        decoded = tokenService.verifyToken(token);
      } catch (error) {
        logger.warn('Authentication failed: Invalid token', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          tokenSource,
          error: error.message
        });
        return res.status(401).json({ 
          success: false,
          message: error.message || 'Token is not valid',
          error: {
            message: error.message || 'Token is not valid',
            code: error.code || 'INVALID_TOKEN'
          }
        });
      }

      /*
       * THE COOKIE AND THE HEADER HAVE TO BE THE SAME PERSON.
       *
       * The cookie wins whenever both are sent (see the extraction above), and
       * that silently decided who a request was FROM. The two stores do not
       * have the same scope: the client keeps its bearer token in
       * sessionStorage, which is per TAB, while the access-token cookie is per
       * ORIGIN and shared by every tab. Sign four judges into four tabs to
       * staff one panel and each tab holds its own judge, but all four send the
       * cookie of whoever signed in LAST.
       *
       * The observed case was three judges' slips arriving as the panel's
       * Scorer, who is not allowed to submit one — a 403, and the lucky
       * outcome. Had the last sign-in been a panel judge the slips would have
       * been ACCEPTED: `admin.controller.js` binds a panel judge to their own
       * seat and discards the body's `judgeType`, so three slips would have
       * been written into one judge's slot, each overwriting the last, with a
       * 200 every time and no way to tell from the scores that anything went
       * wrong.
       *
       * So a disagreement is refused rather than resolved. A header token that
       * will not verify — stale, expired, from a signed-out session — is not a
       * disagreement; there is no identity in it to conflict with, and the
       * cookie carries the request as before.
       */
      if (tokenSource === 'cookie') {
        const authHeader = req.header('Authorization');
        const headerToken = authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length)
          : null;

        if (headerToken && headerToken !== token) {
          let headerUserId = null;
          try {
            headerUserId = tokenService.verifyToken(headerToken)?.userId;
          } catch {
            headerUserId = null;
          }

          if (headerUserId != null && decoded.userId != null
            && String(headerUserId) !== String(decoded.userId)) {
            logger.warn('Authentication failed: cookie and Authorization header disagree', {
              cookieUserId: String(decoded.userId),
              headerUserId: String(headerUserId),
              path: req.path,
              method: req.method,
              ip: req.ip,
            });
            return res.status(401).json({
              success: false,
              message: 'This tab is signed in as a different user than the browser session. '
                + 'Sign in again in this tab, or use a separate browser profile per user.',
              error: {
                message: 'This tab is signed in as a different user than the browser session. '
                  + 'Sign in again in this tab, or use a separate browser profile per user.',
                code: 'IDENTITY_MISMATCH',
              },
            });
          }
        }
      }

      // Check logout-based invalidation (now async for Redis support)
      if (
        decoded.userId != null &&
        typeof decoded.iat === 'number'
      ) {
        const loggedOut = await isTokenLoggedOut(String(decoded.userId), decoded.iat);
        if (loggedOut) {
          logger.warn('Authentication failed: Token invalidated after logout', {
            userId: decoded.userId,
            path: req.path,
            method: req.method,
            ip: req.ip,
          });
          return res.status(401).json({
            success: false,
            message: 'Session ended. Please log in again.',
            error: {
              message: 'Session ended. Please log in again.',
              code: 'TOKEN_INVALIDATED_LOGOUT',
            },
          });
        }
      }

      // Load user using repository
      const repository = authenticationService.getRepositoryByType(decoded.userType);
      const user = await repository.findById(decoded.userId);

      if (!user) {
        logger.warn('Authentication failed: User not found', {
          userId: decoded.userId,
          userType: decoded.userType,
          path: req.path
        });
        return res.status(401).json({ 
          success: false,
          message: 'User not found',
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND'
          }
        });
      }

      // Check if user is active
      if (user.isActive === false) {
        logger.warn('Authentication failed: User inactive', {
          userId: user._id,
          userType: decoded.userType
        });
        return res.status(401).json({ 
          success: false,
          message: 'Account is inactive',
          error: {
            message: 'Account is inactive',
            code: 'ACCOUNT_INACTIVE'
          }
        });
      }

      // Attach user and userType to request
      req.user = user;
      req.userType = decoded.userType;

      // Attach competition context if present in token
      if (decoded.competitionId) {
        req.user.currentCompetition = decoded.competitionId;
      }

      /**
       * A judge principal is an ACCOUNT (src/models/JudgeAccount.js). Everything
       * that used to read a panel field straight off `req.user` — judgeType,
       * gender, ageGroup — now reads the assignments this account holds, and
       * picks the one matching the category being acted on.
       *
       * Loaded once here rather than per guard, because a request commonly
       * passes through two of them (requireJudge then requireSequenceManager)
       * plus a controller.
       *
       * A judge nobody has assigned yet gets an empty array. That is a normal
       * state — anyone can register — and every consumer must treat it as "no
       * access", never as "unrestricted".
       */
      if (decoded.userType === 'judge') {
        req.judgeAssignments = await loadAssignments(
          judgeRepository,
          user._id,
          decoded.competitionId || null
        );
      }

      // --- Token Rotation (Requirement 17.7) ---
      // If the token is older than the rotation threshold, issue a new one.
      // The new token is set as an httpOnly cookie (preferred) and also in
      // X-New-Token header for backward compatibility with non-cookie clients.
      if (typeof tokenService.rotateTokenIfNeeded === 'function') {
        const newToken = tokenService.rotateTokenIfNeeded(decoded);
        if (newToken) {
          setAccessTokenCookie(res, newToken, isProduction);
          res.setHeader('X-New-Token', newToken);
          logger.debug('Token rotation applied', {
            userId: user._id,
            userType: decoded.userType,
            tokenSource,
          });
        }
      }

      logger.debug('Authentication successful', {
        userId: user._id,
        userType: decoded.userType,
        path: req.path,
        tokenSource,
      });

      next();
    } catch (error) {
      logger.error('Authentication middleware error', {
        path: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({ 
        success: false,
        message: 'Authentication failed',
        error: {
          message: 'Authentication failed',
          code: 'AUTH_ERROR'
        }
      });
    }
  };
}

/**
 * The 401 every guard in this file sends when there is no authenticated
 * principal, written once.
 *
 * These stay as direct `res.json` calls rather than thrown AuthenticationError /
 * AuthorizationError: the error middleware would rewrite `code` to
 * `AUTHENTICATION_ERROR`/`AUTHORIZATION_ERROR` and drop `requiredRoles`, and the
 * client matches on these codes.
 *
 * @param {import('express').Response} res
 * @returns {import('express').Response}
 */
function denyUnauthenticated(res) {
  return res.status(401).json({
    success: false,
    error: {
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    }
  });
}

/**
 * The 403 every guard in this file sends when the principal is authenticated
 * but not permitted.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {Object} [extra] - additional error fields, e.g. `requiredRoles`
 * @returns {import('express').Response}
 */
function denyForbidden(res, message, extra = {}) {
  return res.status(403).json({
    success: false,
    error: {
      message,
      code: 'INSUFFICIENT_PERMISSIONS',
      ...extra
    }
  });
}

/**
 * Create role-based authorization middleware
 * @param {string|string[]} allowedRoles - Allowed user types
 * @returns {Function} Express middleware
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.userType) {
      return denyUnauthenticated(res);
    }

    const roles = allowedRoles.flat();
    const hasRole = roles.includes(req.userType) ||
                    (req.user.role && roles.includes(req.user.role));

    if (!hasRole) {
      return denyForbidden(res, 'Access denied. Insufficient permissions.', { requiredRoles: roles });
    }

    next();
  };
}

/**
 * Middleware for endpoints that allow both Admin and Scorer (Judge)
 */
const requireAdminOrScorer = (req, res, next) => {
  if (!req.user || !req.userType) {
    return denyUnauthenticated(res);
  }

  const isAdmin = req.userType === 'admin' || req.userType === 'superadmin' || 
                 (req.user.role && ['admin', 'superadmin'].includes(req.user.role));
                 
  // "Is this judge a Scorer anywhere?" — one person can be Scorer for one
  // category and an evaluation judge in another, and `req.user` is an account,
  // not a panel row.
  const isScorer = req.userType === 'judge' && hasAnyRole(req.judgeAssignments, ['Scorer']);

  if (!isAdmin && !isScorer) {
    return denyForbidden(res, 'Access denied. Requires Admin or Scorer permissions.');
  }
  
  next();
};

/**
 * Middleware for the running-order endpoints under /api/judge.
 *
 * Only the Senior Judge and the Scorer set a panel's running order — the four
 * evaluation judges read it. Admins and superadmins reach the same handlers
 * through their own routers, so this guard covers the judge case only.
 *
 * This is a ROLE check, not an assignment check: it cannot tell whether this
 * Senior Judge belongs to the category being reordered, because the category
 * is in the body. `PerformanceOrderService.assertJudgeMaySequence` does that
 * second half. Both are required — dropping either one lets the Senior Judge
 * of Under-14 Male re-sequence Under-18 Female.
 */
const requireSequenceManager = (req, res, next) => {
  if (!req.user || !req.userType) {
    return denyUnauthenticated(res);
  }

  const isAdmin = req.userType === 'admin' || req.userType === 'superadmin' ||
                  (req.user.role && ['admin', 'superadmin'].includes(req.user.role));

  // Any assignment in a sequencing role gets past this guard; whether it is
  // the RIGHT panel is settled by assertJudgeMaySequence, as described above.
  // Checking a single row here used to refuse a judge who is Senior Judge in
  // the category being reordered but authenticated against a different one.
  const canSequence = req.userType === 'judge' &&
                      hasAnyRole(req.judgeAssignments, SEQUENCE_JUDGE_TYPES);

  if (!isAdmin && !canSequence) {
    return denyForbidden(res, 'Access denied. Only the Senior Judge or Scorer can set the running order.');
  }

  next();
};

/**
 * Middleware to check if user is a player
 */
const requirePlayer = requireRole('player');

/**
 * Middleware to check if user is a coach
 */
const requireCoach = requireRole('coach');

/**
 * Middleware to check if user is an admin (regular or super)
 */
const requireAdmin = requireRole('admin', 'superadmin');

/**
 * Middleware to check if user is a super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !req.userType) {
    return denyUnauthenticated(res);
  }

  const isSuperAdmin = req.userType === 'superadmin' || 
                       req.user.role === 'superadmin';

  if (!isSuperAdmin) {
    return res.status(403).json({ 
      success: false,
      error: {
        message: 'Access denied. Super Admin privileges required.',
        code: 'SUPER_ADMIN_REQUIRED'
      }
    });
  }

  next();
};

/**
 * Middleware to check if user is a judge
 */
const requireJudge = requireRole('judge');

// Backward-compatible export shape:
// - callable default export (legacy: const auth = require('...'); auth(container))
// - named helpers on the same export object
module.exports = createAuthMiddleware;
module.exports.createAuthMiddleware = createAuthMiddleware;
module.exports.authenticate = createAuthMiddleware;
module.exports.requireRole = requireRole;
module.exports.requirePlayer = requirePlayer;
module.exports.requireCoach = requireCoach;
module.exports.requireAdmin = requireAdmin;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireJudge = requireJudge;
module.exports.requireAdminOrScorer = requireAdminOrScorer;
module.exports.requireSequenceManager = requireSequenceManager;
