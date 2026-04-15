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

class RequestCoalescingMiddleware {
  constructor(logger) {
    this.logger = logger;
    // Map to store in-flight requests: key -> Promise
    this.inFlightRequests = new Map();
    // Map to store request metadata for logging
    this.requestMetadata = new Map();
  }

  /**
   * Generate a unique key for a request based on method, path, query, and user
   * @param {Object} req - Express request object
   * @returns {string} Unique request key
   */
  generateRequestKey(req) {
    const method = req.method;
    const path = req.path;
    const query = JSON.stringify(req.query || {});
    const userId = req.user?._id?.toString() || 'anonymous';
    const competitionId = req.headers['x-competition-id'] || '';
    
    return `${method}:${path}:${query}:${userId}:${competitionId}`;
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

    // Don't coalesce health check endpoints
    if (req.path.startsWith('/health')) {
      return false;
    }

    // Don't coalesce metrics endpoints
    if (req.path.startsWith('/metrics')) {
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
        const result = { status: statusCode, data };
        resolvePromise(result);
        return originalJson(data);
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

      // Continue with the request
      next();
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
