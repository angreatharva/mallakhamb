/**
 * Gate for GET /metrics, the Prometheus endpoint Grafana Cloud scrapes.
 *
 * Closed by default:
 *   METRICS_TOKEN unset  → 404, so the endpoint looks absent
 *   token missing/wrong  → 401, with no detail
 *
 * Accepts `Authorization: Bearer <token>`, and also HTTP Basic with any
 * username and the token as the password, for scrapers that only offer Basic.
 * METRICS_TOKEN may be a comma-separated list, so an old and a new token both
 * work during a rotation (deploy/monitoring/PLAN.md §7).
 *
 * Both sides are SHA-256 hashed before `timingSafeEqual`, so the comparison is
 * always over equal-length buffers and the token's length does not leak.
 */

const crypto = require('crypto');

const digest = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();

/** The credential the request presents, or null. */
function presentedToken(header) {
  if (typeof header !== 'string') return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  const value = rest.join(' ');
  if (!value) return null;

  if (/^bearer$/i.test(scheme)) return value;

  if (/^basic$/i.test(scheme)) {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    return colon === -1 ? null : decoded.slice(colon + 1);
  }
  return null;
}

/**
 * @param {string[]|(() => string[])} tokens - the accepted tokens, or a getter
 * @returns {import('express').RequestHandler}
 */
function createMetricsAuthMiddleware(tokens) {
  const readTokens = typeof tokens === 'function' ? tokens : () => tokens;

  return function metricsAuth(req, res, next) {
    const accepted = (readTokens() || []).filter(Boolean);
    res.set('Cache-Control', 'no-store');

    if (accepted.length === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const presented = presentedToken(req.headers.authorization);
    if (presented) {
      const candidate = digest(presented);
      // Check every token rather than stopping at the first match, so the
      // position of the matching token in the list is not observable either.
      let ok = false;
      for (const token of accepted) {
        if (crypto.timingSafeEqual(candidate, digest(token))) ok = true;
      }
      if (ok) return next();
    }

    res.set('WWW-Authenticate', 'Bearer realm="metrics"');
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  };
}

module.exports = { createMetricsAuthMiddleware, presentedToken };
