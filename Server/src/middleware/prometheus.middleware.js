/**
 * HTTP request metrics for Prometheus (`http_server_requests_seconds`).
 *
 * Observes on the response's own events rather than wrapping `res.end` the way
 * metrics.middleware.js does: `finish` means the response was fully handed to
 * the OS, and `close` without `finish` means the client went away first, which
 * is recorded as status 499 / outcome UNKNOWN (nginx's convention).
 *
 * Mounted ahead of every router so `trackRouting` can capture the matched
 * pattern as Express assigns it — see route-label.js for why reading it on
 * `finish` gives the wrong answer for errors.
 *
 * Excluded: the scrape itself, and the two probes that would otherwise dominate
 * the counts and drag the latency down — Render's `/api/health/live` check and
 * the keep-alive's `/api/health/ping`, plus the bare service root.
 */

const { trackRouting, routeLabel, createUriCap } = require('../infrastructure/prometheus/route-label');

const EXCLUDED_PATHS = new Set([
  '/',
  '/metrics',
  '/api/health/ping',
  '/api/health/live',
  '/api/v1/health/ping',
  '/api/v1/health/live',
]);

/**
 * @param {Object} metrics - from createMetrics()
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @param {number} [options.maxUris]
 */
function createPrometheusMiddleware(metrics, { logger, maxUris } = {}) {
  const cap = createUriCap({
    max: maxUris,
    onOverflow: (uri) => logger?.warn?.('Prometheus uri label cap reached; new routes are labelled OTHER', {
      firstOverflow: uri,
    }),
  });

  return function prometheusMiddleware(req, res, next) {
    if (EXCLUDED_PATHS.has(req.path)) return next();

    const start = process.hrtime.bigint();
    trackRouting(req);

    let recorded = false;
    const record = (status) => {
      if (recorded) return;
      recorded = true;
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      metrics.http.observe(req.method, routeLabel(req, cap), status, seconds);
    };

    res.on('finish', () => record(res.statusCode));
    res.on('close', () => {
      if (!res.writableFinished) record('499');
    });

    next();
  };
}

module.exports = { createPrometheusMiddleware, EXCLUDED_PATHS };
