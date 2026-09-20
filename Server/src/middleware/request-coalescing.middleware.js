/**
 * Request Coalescing Middleware
 * 
 * Prevents duplicate concurrent requests to the same resource.
 * When multiple identical requests arrive simultaneously, only the first
 * request is processed, and subsequent requests wait for and share the result.
 * 
 * This optimization reduces database load and improves response times for
 * duplicate concurrent requests (e.g., multiple tabs loading the same data).
 * 
 * Requirements: 16.6
 */

const crypto = require('node:crypto');

const { COOKIE_NAMES } = require('../utils/security/cookie.util');

class RequestCoalescingMiddleware {
  constructor(logger) {
    this.logger = logger;
    // Map to store in-flight requests: key -> Promise
    this.inFlightRequests = new Map();
    // Map to store request metadata for logging
    this.requestMetadata = new Map();
  }

  /**
   * WHO this request is from, decided WITHOUT waiting for authentication.
   *
   * This is the part of the key that stops one user being served another
   * user's response, and it cannot be `req.user`. This middleware is mounted
   * app-wide in `createApp.js`, several layers ABOVE the routers, and
   * `authMiddleware` runs per route — so `req.user` is still undefined here on
   * every request, authenticated or not.
   *
   * It used to read exactly that, `req.user?._id ... || 'anonymous'`, which
   * meant every signed-in GET keyed as `anonymous`: two coaches asking
   * `GET /api/coaches/teams` at the same moment collided on one key and the
   * second was served the FIRST one's body. Reproduced deterministically —
   * four coaches, four concurrent reads, three of them got the first coach's
   * team, every round. Sequentially it never happened, because coalescing only
   * engages while a request is still in flight. In a live event, where several
   * people load the same screen at once and the SPA itself fires duplicate
   * effects, that is a cross-account data leak.
   *
   * So the identity comes from the CREDENTIAL, which is present this early:
   * the access-token cookie and the Authorization header. Both, because the
   * cookie outranks the header downstream and a request may carry either.
   *
   * HASHED, not stored raw: this value goes into `requestKey`, which is
   * written to the debug log on every coalesced request. A key is not a place
   * to put a bearer token.
   *
   * Requests carrying no credential at all key as `anonymous` together, which
   * is the case coalescing was written for — a public leaderboard hit by a
   * hundred spectators at once.
   *
   * @param {Object} req - Express request object
   * @returns {string}
   */
  callerKey(req) {
    // Correct if this is ever mounted after authentication; never true today.
    const authenticated = req.user?._id?.toString();
    if (authenticated) return `u:${authenticated}`;

    /*
     * The RAW Cookie header, not `req.cookies`.
     *
     * `req.cookies` exists only once `cookie-parser` has run. It does today —
     * createApp mounts it above this — but that is an ordering assumption, and
     * getting it wrong does not crash: `req.cookies` is undefined, every
     * signed-in caller keys as `anonymous` again, and the leak returns in
     * silence. The header is on the request whatever has or has not run, so
     * this cannot be undone by moving a `use`.
     *
     * Only the access token is extracted, deliberately. Hashing the whole
     * header would split the key on any unrelated cookie — a rotating CSRF
     * value, say — and public endpoints, which are where coalescing actually
     * pays, would stop sharing a key at all.
     */
    const rawCookie = req.headers?.cookie || '';
    const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_NAMES.ACCESS_TOKEN}=([^;]*)`).exec(rawCookie)?.[1] || '';
    const header = req.headers?.authorization || '';
    if (!cookie && !header) return 'anonymous';

    return `c:${crypto.createHash('sha256').update(`${cookie}\0${header}`).digest('hex').slice(0, 32)}`;
  }

  /**
   * Generate a unique key for a request based on method, path, query, and caller
   * @param {Object} req - Express request object
   * @returns {string} Unique request key
   */
  generateRequestKey(req) {
    const method = req.method;
    const path = req.path;
    const query = JSON.stringify(req.query || {});
    const caller = this.callerKey(req);
    const competitionId = req.headers['x-competition-id'] || '';

    return `${method}:${path}:${query}:${caller}:${competitionId}`;
  }

  /**
   * Check if a request should be coalesced
   * Only coalesce GET requests (safe, idempotent operations)
   * @param {Object} req - Express request object
   * @returns {boolean} True if request should be coalesced
   */
  shouldCoalesce(req) {
    // Only coalesce GET requests
    if (req.method !== 'GET') {
      return false;
    }

    /*
     * Health and metrics are exempt — a liveness probe must measure THIS
     * request, not ride on one already in flight.
     *
     * The tests below used to be `startsWith('/health')` and
     * `startsWith('/metrics')`. This middleware is mounted app-wide
     * (createApp.js), so `req.path` is the full path — `/api/health/live`,
     * `/api/v1/health/metrics` — and neither prefix ever matched. Both
     * exemptions were dead, and the metrics endpoint was being coalesced.
     */
    if (/^\/api(\/v\d+)?\/(health|metrics)(\/|$)/.test(req.path)) {
      return false;
    }

    return true;
  }

  /**
   * Middleware function to coalesce duplicate concurrent requests
   * @returns {Function} Express middleware function
   */
  middleware() {
    return async (req, res, next) => {
      // Skip coalescing if not applicable
      if (!this.shouldCoalesce(req)) {
        return next();
      }

      const requestKey = this.generateRequestKey(req);

      // Check if there's already an in-flight request for this key
      if (this.inFlightRequests.has(requestKey)) {
        const metadata = this.requestMetadata.get(requestKey);
        metadata.coalescedCount++;

        this.logger.debug('Request coalesced', {
          requestKey,
          method: req.method,
          path: req.path,
          coalescedCount: metadata.coalescedCount,
          correlationId: req.correlationId
        });

        try {
          // Wait for the in-flight request to complete
          const result = await this.inFlightRequests.get(requestKey);

          /*
           * Only a JSON response can be replayed — we captured `data`, not the
           * bytes. A handler that answered with res.send / res.end / a redirect
           * (the Prometheus metrics format, the docs page, a 304 from an ETag)
           * gives us nothing to replay, so this request does its own work
           * instead. Falling through is always correct here; replaying is the
           * optimisation.
           */
          if (!result.replayable) {
            return next();
          }

          // Send the cached result
          res.status(result.status).json(result.data);
        } catch (error) {
          // If the original request failed, pass the error to this request
          next(error);
        }

        return;
      }

      // This is the first request for this key - create a promise to track it
      let resolvePromise, rejectPromise;
      const requestPromise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      // Store the original res.json and res.status methods
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      let statusCode = 200;

      // Override res.status to capture the status code
      res.status = function(code) {
        statusCode = code;
        return originalStatus(code);
      };

      // Override res.json to capture the response and resolve the promise
      res.json = function(data) {
        const result = { status: statusCode, data, replayable: true };
        resolvePromise(result);
        return originalJson(data);
      };

      /*
       * Settle on 'finish' no matter how the response was produced.
       *
       * Resolving ONLY inside the res.json override meant any handler that
       * answered another way — res.send, res.end, a redirect, a 304 from an
       * ETag — left this promise pending forever. The `.finally()` below then
       * never ran, so the key was never deleted, and every subsequent identical
       * GET awaited a promise that would never settle: the request hung until
       * the client gave up, and the entry leaked.
       *
       * It was not hypothetical. `GET /api/health/metrics?format=prometheus`
       * answers with res.send, so it served exactly ONE scrape and then hung
       * for the life of the process.
       *
       * 'finish' fires after the response is fully flushed, and resolving an
       * already-resolved promise is a no-op, so the JSON path is unaffected.
       */
      res.on('finish', () => {
        resolvePromise({ status: res.statusCode, data: null, replayable: false });
      });

      /*
       * A client that disconnects mid-flight never fires 'finish'. Settle on
       * 'close' too, or an aborted request leaves the same permanently-pending
       * entry this whole comment is about.
       */
      res.on('close', () => {
        resolvePromise({ status: res.statusCode, data: null, replayable: false });
      });

      // Store the original next function to intercept errors
      const originalNext = next;
      const errorAwareNext = (error) => {
        if (error) {
          // Reject the promise so coalesced requests also receive the error
          rejectPromise(error);
        }
        originalNext(error);
      };

      // Store the request promise and metadata
      this.inFlightRequests.set(requestKey, requestPromise);
      this.requestMetadata.set(requestKey, {
        startTime: Date.now(),
        coalescedCount: 0,
        method: req.method,
        path: req.path
      });

      // Clean up after the request completes (success or failure)
      requestPromise
        .finally(() => {
          const metadata = this.requestMetadata.get(requestKey);
          if (!metadata) return;
          const duration = Date.now() - metadata.startTime;

          if (metadata.coalescedCount > 0) {
            this.logger.info('Request coalescing completed', {
              requestKey,
              method: metadata.method,
              path: metadata.path,
              coalescedCount: metadata.coalescedCount,
              duration,
              correlationId: req.correlationId
            });
          }

          // Remove from in-flight requests immediately so sequential requests
          // are not incorrectly coalesced
          this.inFlightRequests.delete(requestKey);
          this.requestMetadata.delete(requestKey);
        });

      // Continue with the request using error-aware next
      errorAwareNext();
    };
  }

  /**
   * Get statistics about request coalescing
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      inFlightRequests: this.inFlightRequests.size,
      totalCoalescedRequests: Array.from(this.requestMetadata.values())
        .reduce((sum, metadata) => sum + metadata.coalescedCount, 0)
    };
  }

  /**
   * Clear all in-flight requests (useful for testing)
   */
  clear() {
    this.inFlightRequests.clear();
    this.requestMetadata.clear();
  }
}

module.exports = RequestCoalescingMiddleware;
