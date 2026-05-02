/**
 * middleware-security.property.test.js
 * 
 * Property-based tests for security middleware.
 * Feature: old-config-migration, Property 16 & 17
 * 
 * Tests:
 * - Property 16: NoSQL injection operators are sanitized in all request bodies
 * - Property 17: Raw body is preserved for all requests
 */

const fc = require('fast-check');
const request = require('supertest');
const express = require('express');
const mongoSanitize = require('express-mongo-sanitize');

// Helper to create test Express app with security middleware
const createTestApp = () => {
  const app = express();
  
  // Apply the same middleware as in server.js
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  
  app.use(mongoSanitize({
    replaceWith: '_',
  }));
  
  // Test endpoint that echoes back the request body and rawBody
  app.post('/test-endpoint', (req, res) => {
    res.json({
      body: req.body,
      rawBody: req.rawBody,
      bodyKeys: Object.keys(req.body),
    });
  });
  
  // Test endpoint for authenticated operations (simulated)
  app.post('/test-auth', (req, res) => {
    res.json({
      body: req.body,
      sanitized: true,
    });
  });
  
  return app;
};

describe('Middleware Security Property Tests', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  /**
   * Property 16: NoSQL injection operators are sanitized in all request bodies
   * 
   * **Validates: Requirements 10.4**
   * 
   * For any request body containing MongoDB operator keys (e.g., $where, $gt),
   * the mongoSanitize middleware should replace those keys with _ before the
   * body reaches any route handler.
   */
  describe('Property 16: NoSQL injection operators are sanitized in all request bodies', () => {
    it('should replace all MongoDB operator keys with underscore', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            normalField: fc.string({ minLength: 1 }).filter(s => 
              !s.startsWith('$') && 
              !s.startsWith('.') && 
              s.trim().length > 0 &&
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) // Valid JS identifier
            ),
            operatorField: fc.constantFrom('$where', '$gt', '$ne', '$in', '$nin', '$or', '$and', '$regex', '$exists'),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          async (testData) => {
            // Create a request body with a MongoDB operator key
            const requestBody = {
              [testData.normalField]: testData.value,
              [testData.operatorField]: testData.value,
            };

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            // Check that the operator key was replaced with underscore
            const receivedBody = response.body.body;
            
            // The operator key should be replaced with _
            const sanitizedKey = testData.operatorField.replace('$', '_');
            expect(receivedBody).toHaveProperty(sanitizedKey);
            expect(receivedBody).not.toHaveProperty(testData.operatorField);
            
            // Normal field should remain unchanged
            expect(receivedBody).toHaveProperty(testData.normalField);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize nested MongoDB operators', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('$where', '$gt', '$ne', '$in', '$nin', '$or', '$and'),
          fc.string(),
          async (operator, value) => {
            const requestBody = {
              user: {
                [operator]: value,
                name: 'test',
              },
              query: {
                [operator]: { nested: value },
              },
            };

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            const receivedBody = response.body.body;
            
            // Check nested sanitization
            const sanitizedKey = operator.replace('$', '_');
            expect(receivedBody.user).toHaveProperty(sanitizedKey);
            expect(receivedBody.user).not.toHaveProperty(operator);
            expect(receivedBody.query).toHaveProperty(sanitizedKey);
            expect(receivedBody.query).not.toHaveProperty(operator);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize all common MongoDB injection operators', async () => {
      const dangerousOperators = [
        '$where',
        '$gt',
        '$gte',
        '$lt',
        '$lte',
        '$ne',
        '$in',
        '$nin',
        '$or',
        '$and',
        '$not',
        '$nor',
        '$exists',
        '$type',
        '$regex',
        '$expr',
        '$jsonSchema',
        '$mod',
        '$text',
        '$elemMatch',
      ];

      for (const operator of dangerousOperators) {
        const requestBody = {
          [operator]: 'malicious value',
          normalField: 'safe value',
        };

        const response = await request(app)
          .post('/test-endpoint')
          .send(requestBody)
          .expect(200);

        const receivedBody = response.body.body;
        
        // Operator should be sanitized
        const sanitizedKey = operator.replace('$', '_');
        expect(receivedBody).toHaveProperty(sanitizedKey);
        expect(receivedBody).not.toHaveProperty(operator);
        
        // Normal field should remain
        expect(receivedBody.normalField).toBe('safe value');
      }
    });

    it('should handle arrays with MongoDB operators', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('$where', '$gt', '$ne', '$in'),
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          async (operator, values) => {
            const requestBody = {
              items: [
                { [operator]: values[0] },
                { name: 'safe' },
              ],
            };

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            const receivedBody = response.body.body;
            
            // Check array element sanitization
            const sanitizedKey = operator.replace('$', '_');
            expect(receivedBody.items[0]).toHaveProperty(sanitizedKey);
            expect(receivedBody.items[0]).not.toHaveProperty(operator);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 17: Raw body is preserved for all requests
   * 
   * **Validates: Requirements 10.6**
   * 
   * For any request body, req.rawBody should equal the original UTF-8 string
   * of the request body, regardless of content.
   */
  describe('Property 17: Raw body is preserved for all requests', () => {
    it('should preserve raw body as UTF-8 string for all JSON values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.jsonValue(),
          async (jsonValue) => {
            // Skip undefined as it's not valid JSON
            if (jsonValue === undefined) return;

            const requestBody = { data: jsonValue };
            const expectedRawBody = JSON.stringify(requestBody);

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            // Raw body should match the original JSON string
            expect(response.body.rawBody).toBe(expectedRawBody);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve raw body for complex nested objects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            string: fc.string(),
            number: fc.integer(),
            boolean: fc.boolean(),
            nested: fc.record({
              array: fc.array(fc.integer(), { maxLength: 5 }),
              object: fc.record({
                deep: fc.string(),
              }),
            }),
          }),
          async (complexObject) => {
            const expectedRawBody = JSON.stringify(complexObject);

            const response = await request(app)
              .post('/test-endpoint')
              .send(complexObject)
              .expect(200);

            // Raw body should exactly match the stringified input
            expect(response.body.rawBody).toBe(expectedRawBody);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve raw body with special characters and unicode', async () => {
      const specialCases = [
        { emoji: '🚀🎉' },
        { unicode: 'Hello 世界' },
        { special: 'test\n\t\r' },
        { quotes: 'He said "hello"' },
        { backslash: 'path\\to\\file' },
        { mixed: '{"nested": "value"}' },
      ];

      for (const testCase of specialCases) {
        const expectedRawBody = JSON.stringify(testCase);

        const response = await request(app)
          .post('/test-endpoint')
          .send(testCase)
          .expect(200);

        expect(response.body.rawBody).toBe(expectedRawBody);
      }
    });

    it('should preserve raw body even after sanitization', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('$where', '$gt', '$ne', '$in'),
          fc.string(),
          async (operator, value) => {
            const requestBody = {
              [operator]: value,
              normalField: 'test',
            };
            const expectedRawBody = JSON.stringify(requestBody);

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            // Raw body should contain the ORIGINAL body (before sanitization)
            expect(response.body.rawBody).toBe(expectedRawBody);
            
            // But the parsed body should be sanitized
            const sanitizedKey = operator.replace('$', '_');
            expect(response.body.body).toHaveProperty(sanitizedKey);
            expect(response.body.body).not.toHaveProperty(operator);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve raw body for empty and minimal objects', async () => {
      const minimalCases = [
        {},
        { a: 1 },
        { '': '' },
        { null: null },
        { array: [] },
      ];

      for (const testCase of minimalCases) {
        const expectedRawBody = JSON.stringify(testCase);

        const response = await request(app)
          .post('/test-endpoint')
          .send(testCase)
          .expect(200);

        expect(response.body.rawBody).toBe(expectedRawBody);
      }
    });

    it('should preserve raw body with large payloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.integer(),
              name: fc.string({ maxLength: 50 }),
              data: fc.string({ maxLength: 100 }),
            }),
            { minLength: 10, maxLength: 50 }
          ),
          async (largeArray) => {
            const requestBody = { items: largeArray };
            const expectedRawBody = JSON.stringify(requestBody);

            // Only test if within size limit (1MB)
            if (expectedRawBody.length > 1024 * 1024) return;

            const response = await request(app)
              .post('/test-endpoint')
              .send(requestBody)
              .expect(200);

            expect(response.body.rawBody).toBe(expectedRawBody);
          }
        ),
        { numRuns: 20 } // Reduced runs for large payloads
      );
    });
  });
});
