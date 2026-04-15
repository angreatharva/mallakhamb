/**
 * Request Coalescing Middleware Tests
 */

const RequestCoalescingMiddleware = require('./request-coalescing.middleware');

describe('RequestCoalescingMiddleware', () => {
  let middleware;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    };
    middleware = new RequestCoalescingMiddleware(mockLogger);
  });

  afterEach(() => {
    middleware.clear();
  });

  describe('generateRequestKey', () => {
    test('should generate unique key for different requests', () => {
      const req1 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {}
      };

      const req2 = {
        method: 'GET',
        path: '/api/teams',
        query: {},
        user: { _id: 'user1' },
        headers: {}
      };

      const key1 = middleware.generateRequestKey(req1);
      const key2 = middleware.generateRequestKey(req2);

      expect(key1).not.toBe(key2);
    });

    test('should generate same key for identical requests', () => {
      const req1 = {
        method: 'GET',
        path: '/api/competitions',
        query: { status: 'active' },
        user: { _id: 'user1' },
        headers: {}
      };

      const req2 = {
        method: 'GET',
        path: '/api/competitions',
        query: { status: 'active' },
        user: { _id: 'user1' },
        headers: {}
      };

      const key1 = middleware.generateRequestKey(req1);
      const key2 = middleware.generateRequestKey(req2);

      expect(key1).toBe(key2);
    });

    test('should include competition ID in key', () => {
      const req1 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: { 'x-competition-id': 'comp1' }
      };

      const req2 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: { 'x-competition-id': 'comp2' }
      };

      const key1 = middleware.generateRequestKey(req1);
      const key2 = middleware.generateRequestKey(req2);

      expect(key1).not.toBe(key2);
    });

    test('should handle anonymous users', () => {
      const req = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        headers: {}
      };

      const key = middleware.generateRequestKey(req);

      expect(key).toContain('anonymous');
    });
  });

  describe('shouldCoalesce', () => {
    test('should coalesce GET requests', () => {
      const req = {
        method: 'GET',
        path: '/api/competitions'
      };

      expect(middleware.shouldCoalesce(req)).toBe(true);
    });

    test('should not coalesce POST requests', () => {
      const req = {
        method: 'POST',
        path: '/api/competitions'
      };

      expect(middleware.shouldCoalesce(req)).toBe(false);
    });

    test('should not coalesce PUT requests', () => {
      const req = {
        method: 'PUT',
        path: '/api/competitions/123'
      };

      expect(middleware.shouldCoalesce(req)).toBe(false);
    });

    test('should not coalesce DELETE requests', () => {
      const req = {
        method: 'DELETE',
        path: '/api/competitions/123'
      };

      expect(middleware.shouldCoalesce(req)).toBe(false);
    });

    test('should not coalesce health check endpoints', () => {
      const req = {
        method: 'GET',
        path: '/health'
      };

      expect(middleware.shouldCoalesce(req)).toBe(false);
    });

    test('should not coalesce metrics endpoints', () => {
      const req = {
        method: 'GET',
        path: '/metrics'
      };

      expect(middleware.shouldCoalesce(req)).toBe(false);
    });
  });

  describe('middleware', () => {
    test('should pass through non-GET requests', async () => {
      const req = {
        method: 'POST',
        path: '/api/competitions',
        query: {},
        headers: {}
      };
      const res = {};
      const next = jest.fn();

      const middlewareFn = middleware.middleware();
      await middlewareFn(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    test('should process first request normally', async () => {
      const req = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      const middlewareFn = middleware.middleware();
      
      // Start the first request (don't await yet)
      const promise = middlewareFn(req, res, next);

      // Verify request is in-flight
      expect(middleware.inFlightRequests.size).toBe(1);

      // Complete the request
      res.json({ data: 'test' });
      await promise;

      expect(next).toHaveBeenCalled();
    });

    test('should coalesce duplicate concurrent requests', async () => {
      const req1 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr1'
      };
      const req2 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr2'
      };

      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next1 = jest.fn();
      const next2 = jest.fn();

      const middlewareFn = middleware.middleware();

      // Start first request
      const promise1 = middlewareFn(req1, res1, next1);

      // Start second request (should be coalesced)
      const promise2 = middlewareFn(req2, res2, next2);

      // Complete first request
      res1.json({ data: 'test' });

      await Promise.all([promise1, promise2]);

      // First request should call next
      expect(next1).toHaveBeenCalled();

      // Second request should not call next (it was coalesced)
      expect(next2).not.toHaveBeenCalled();

      // Second request should receive the same response
      expect(res2.json).toHaveBeenCalledWith({ data: 'test' });

      // Logger should log coalescing
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Request coalesced',
        expect.objectContaining({
          coalescedCount: 1
        })
      );
    });

    test.skip('should handle errors in original request', async () => {
      const req1 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr1'
      };
      const req2 = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr2'
      };

      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const error = new Error('Test error');
      const next1 = jest.fn((err) => {
        if (err) throw err;
      });
      const next2 = jest.fn();

      const middlewareFn = middleware.middleware();

      // Start first request
      const promise1 = middlewareFn(req1, res1, next1);

      // Start second request (should be coalesced)
      const promise2 = middlewareFn(req2, res2, next2);

      // Simulate error by calling next with error
      try {
        await promise1;
      } catch (e) {
        // Expected error
      }

      try {
        await promise2;
      } catch (e) {
        // Second request should also receive error
        expect(next2).toHaveBeenCalledWith(error);
      }
    }, 5000);

    test('should clean up after request completes', async () => {
      const req = {
        method: 'GET',
        path: '/api/competitions',
        query: {},
        user: { _id: 'user1' },
        headers: {},
        correlationId: 'corr1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      const middlewareFn = middleware.middleware();
      
      const promise = middlewareFn(req, res, next);
      res.json({ data: 'test' });
      await promise;

      // Wait for cleanup timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(middleware.inFlightRequests.size).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return statistics', () => {
      const stats = middleware.getStats();

      expect(stats).toHaveProperty('inFlightRequests');
      expect(stats).toHaveProperty('totalCoalescedRequests');
      expect(stats.inFlightRequests).toBe(0);
      expect(stats.totalCoalescedRequests).toBe(0);
    });
  });

  describe('clear', () => {
    test('should clear all in-flight requests', () => {
      middleware.inFlightRequests.set('key1', Promise.resolve());
      middleware.requestMetadata.set('key1', { coalescedCount: 1 });

      middleware.clear();

      expect(middleware.inFlightRequests.size).toBe(0);
      expect(middleware.requestMetadata.size).toBe(0);
    });
  });
});
