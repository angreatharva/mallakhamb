/**
 * The `uri` label for `http_server_requests_seconds`.
 *
 * The label must be the route PATTERN (`/api/admin/teams/:teamId`), never the
 * concrete path: a concrete path carries ids, so every team, athlete and
 * competition would mint its own series — unbounded, and personal. See
 * deploy/monitoring/PLAN.md §5.2 for the rules implemented here.
 *
 * Why the pattern is captured AS EXPRESS ASSIGNS IT rather than read on
 * `finish`: Express 4 sets `req.route` at match time, when `req.baseUrl` is the
 * full mount path. But a route that calls `next(err)` unwinds every router on
 * the way to the app-level error handler, and each one restores `req.baseUrl`
 * to what it was on entry — so by `finish` a 500 from
 * `/api/admin/scores/save` would read `baseUrl === ''` and be labelled
 * `/scores/save`. `trackRouting` installs accessors that snapshot the pattern
 * at the moment it is true.
 */

const ROUTING = Symbol('prometheus.routing');

/** Micrometer's label for a request no route claimed. */
const UNKNOWN = 'UNKNOWN';
/** What a new value becomes once the cap is reached. */
const OTHER = 'OTHER';
/** Hard ceiling on distinct `uri` values, as a safety net under the pattern rule. */
const DEFAULT_MAX_URIS = 400;

/**
 * Snapshot the matched route and the deepest mount path as Express assigns
 * them. Call once per request, before any router runs.
 * @param {import('express').Request} req
 */
function trackRouting(req) {
  const state = { pattern: null, deepestBase: '' };
  let route = req.route;
  let baseUrl = req.baseUrl;

  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get() { return route; },
    set(value) {
      route = value;
      if (value && value.path !== undefined) {
        state.pattern = `${baseUrl || ''}${String(value.path)}`;
      }
    },
  });

  Object.defineProperty(req, 'baseUrl', {
    configurable: true,
    enumerable: true,
    get() { return baseUrl; },
    set(value) {
      baseUrl = value;
      // Every router a request enters is mounted on a prefix of its path, so
      // the longest base ever assigned is the innermost router it reached.
      // Restores on the way out are shorter and leave this alone.
      if (typeof value === 'string' && value.length > state.deepestBase.length) {
        state.deepestBase = value;
      }
    },
  });

  req[ROUTING] = state;
}

/**
 * The raw (un-normalised) pattern for a request.
 *   matched route          → baseUrl + route.path
 *   ended inside a router  → baseUrl + '/**'   (e.g. a router-level auth guard)
 *   no router at all       → UNKNOWN
 * @param {Object} req
 * @returns {string}
 */
function routePattern(req) {
  const state = req[ROUTING];
  if (state) {
    if (state.pattern) return state.pattern;
    if (state.deepestBase) return `${state.deepestBase}/**`;
    return UNKNOWN;
  }
  // Untracked request (unit tests, or a request that skipped the middleware).
  if (req.route && req.route.path !== undefined) {
    return `${req.baseUrl || ''}${String(req.route.path)}`;
  }
  if (req.baseUrl) return `${req.baseUrl}/**`;
  return UNKNOWN;
}

/**
 * Fold the versioned mount into the unversioned one (one router is mounted at
 * both `/api/v1` and `/api`, so without this every route counts twice), and
 * replace any raw ObjectId that slipped into a pattern.
 * @param {string} pattern
 * @returns {string}
 */
function normalizeUri(pattern) {
  if (pattern === UNKNOWN) return pattern;
  return pattern
    .replace(/^\/api\/v1(?=\/|$)/, '/api')
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id');
}

/**
 * A cap on distinct values. Past `max`, unseen values collapse to OTHER and
 * `onOverflow` is called once.
 * @param {Object} [options]
 * @param {number} [options.max]
 * @param {Function} [options.onOverflow]
 * @returns {(uri: string) => string}
 */
function createUriCap({ max = DEFAULT_MAX_URIS, onOverflow = () => {} } = {}) {
  const seen = new Set();
  let warned = false;
  return (uri) => {
    if (seen.has(uri)) return uri;
    if (seen.size >= max) {
      if (!warned) {
        warned = true;
        onOverflow(uri);
      }
      return OTHER;
    }
    seen.add(uri);
    return uri;
  };
}

/**
 * The finished `uri` label.
 * @param {Object} req
 * @param {(uri: string) => string} [cap]
 * @returns {string}
 */
function routeLabel(req, cap = (uri) => uri) {
  return cap(normalizeUri(routePattern(req)));
}

module.exports = {
  trackRouting,
  routePattern,
  normalizeUri,
  createUriCap,
  routeLabel,
  UNKNOWN,
  OTHER,
  DEFAULT_MAX_URIS,
};
