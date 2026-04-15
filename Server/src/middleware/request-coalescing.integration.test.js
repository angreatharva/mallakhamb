/**
 * Request Coalescing Middleware Integration Tests
 * 
 * Tests the middleware in a more realistic Express app scenario
 */

const express = require('express');
const request = require('supertest');
const RequestCoalescingMiddleware = require('./request-coalescing.middleware');

describe('RequestCoalescingMiddleware Integration', () => {
  let app;
  let middleware;
  let mockLogger;
  let requestCount;

  beforeEach(() => {
    requestCount = 0;
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    };
    middleware = new RequestCoalescingMiddleware(mockLogger);

    // Create Express app
    app = express();
    app.use(express.json());

    // Add correlation ID middleware (simulating real app)
    app.use((req, res, next) => {
      req.correlationId = `test-${Date.now()}`;
      next();
    });

    // Add request coalescing middleware
    app.use(middleware.middleware());

    // Test route that simulates database query
    app.get('/api/test', async (req, res) => {
      requestCount++;
      // Simulate async database query
      await new Promise(resolve => setTimeout(resolve, 50));
      res.json({ data: 'test', requestCount });
    });

    // Test route for POST (should not be coalesced)
    app.post('/api/test', (req, res) => {
      requestCount++;
      res.json({ data: 'created', requestCount });
    });
  });

  afterEach(() => {
    middleware.clear();
  });

  test('should handle single request normally', async () => {
    const response = await request(app)
      .get('/api/test')
      .expect(200);

    expect(response.body.data).toBe('test');
    expect(requestCount).toBe(1);
  });

  test('should coalesce duplicate concurrent GET requests', async () => {
    // Send 3 identical requests concurrently
    const promises = [
      request(app).get('/api/test'),
      request(app).get('/api/test'),
      request(app).get('/api/test')
    ];

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.data).toBe('test');
    });

    // But only one should have hit the route handler
    expect(requestCount).toBe(1);

    // All should get the same response
    expect(responses[0].body.requestCount).toBe(1);
    expect(responses[1].body.requestCount).toBe(1);
    expect(responses[2].body.requestCount).toBe(1);
  });

  test('should not coalesce POST requests', async () => {
    // Send 3 identical POST requests concurrently
    const promises = [
      request(app).post('/api/test').send({ data: 'test' }),
      request(app).post('/api/test').send({ data: 'test' }),
      request(app).post('/api/test').send({ data: 'test' })
    ];

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.data).toBe('created');
    });

    // All should have hit the route handler
    expect(requestCount).toBe(3);
  });

  test('should not coalesce requests with different query parameters', async () => {
    // Add route with query params
    app.get('/api/items', (req, res) => {
      requestCount++;
      res.json({ filter: req.query.filter, requestCount });
    });

    // Send requests with different query params
    const promises = [
      request(app).get('/api/items?filter=active'),
      request(app).get('/api/items?filter=inactive')
    ];

    const responses = await Promise.all(promises);

    // Both should succeed
    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(200);

    // Both should have hit the route handler
    expect(requestCount).toBe(2);

    // Should have different responses
    expect(responses[0].body.filter).toBe('active');
    expect(responses[1].body.filter).toBe('inactive');
  });

  test('should handle sequential requests normally', async () => {
    // Send requests sequentially
    const response1 = await request(app).get('/api/test');
    const response2 = await request(app).get('/api/test');
    const response3 = await request(app).get('/api/test');

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);

    // All should have hit the route handler (not coalesced because sequential)
    expect(requestCount).toBe(3);
  });

  test('should log coalescing activity', async () => {
    // Send 3 identical requests concurrently
    const promises = [
      request(app).get('/api/test'),
      request(app).get('/api/test'),
      request(app).get('/api/test')
    ];

    await Promise.all(promises);

    // Should log debug messages for coalesced requests
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Request coalesced',
      expect.objectContaining({
        method: 'GET',
        path: '/api/test'
      })
    );

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should log info message when coalescing completes
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Request coalescing completed',
      expect.objectContaining({
        method: 'GET',
        path: '/api/test',
        coalescedCount: 2
      })
    );
  });

  test('should provide statistics', async () => {
    // Verify initial stats are zero
    const initialStats = middleware.getStats();
    expect(initialStats.inFlightRequests).toBe(0);
    expect(initialStats.totalCoalescedRequests).toBe(0);

    // Send concurrent requests - the first one will be in-flight while the second is coalesced
    await Promise.all([
      request(app).get('/api/test'),
      request(app).get('/api/test')
    ]);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 150));

    const statsAfterCompletion = middleware.getStats();
    expect(statsAfterCompletion.inFlightRequests).toBe(0);
  });
});
