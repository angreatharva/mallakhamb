const request = require('supertest');
const express = require('express');

// Set up the app structure similar to loadRoutes but isolated
const app = express();
app.use(express.json());

// We mock the auth middleware to isolate route tests.
//
// This mock must export every guard admin.routes.js imports at module scope.
// A missing guard resolves to `undefined` and Express throws
// "Route.get() requires a callback function" while the router is being built,
// which fails the whole suite at load time rather than in a single test.
// Keep the shape in sync with module.exports at the bottom of
// src/middleware/auth.middleware.js.
jest.mock('../middleware/auth.middleware', () => {
  // The real middleware sets BOTH req.userType and req.user; the guards below
  // read both, so the mock has to populate both to be faithful.
  const createAuthMiddleware = () => (req, res, next) => {
    if (req.header('Authorization')) {
      const role = req.header('Role') || 'player';
      req.userType = role;
      req.user = { role, judgeType: req.header('JudgeType') || undefined };
      next();
    } else {
      res.status(401).json({ message: 'No authorization token provided' });
    }
  };

  // Mirrors the real signature: variadic, flattened, and matches on either
  // req.userType or req.user.role.
  const requireRole = (...allowedRoles) => (req, res, next) => {
    const roles = allowedRoles.flat();
    if (req.user && (roles.includes(req.userType) || roles.includes(req.user.role))) {
      next();
    } else {
      res.status(403).json({ message: 'Insufficient permissions' });
    }
  };

  const requireAdminOrScorer = (req, res, next) => {
    if (!req.user || !req.userType) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const isAdmin =
      ['admin', 'superadmin'].includes(req.userType) ||
      (req.user.role && ['admin', 'superadmin'].includes(req.user.role));
    const isScorer = req.userType === 'judge' && req.user.judgeType === 'Scorer';

    if (!isAdmin && !isScorer) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };

  createAuthMiddleware.requireRole = requireRole;
  createAuthMiddleware.requireAdmin = requireRole('admin', 'superadmin');
  createAuthMiddleware.requireSuperAdmin = requireRole('superadmin');
  createAuthMiddleware.requireJudge = requireRole('judge');
  createAuthMiddleware.requirePlayer = requireRole('player');
  createAuthMiddleware.requireCoach = requireRole('coach');
  createAuthMiddleware.requireAdminOrScorer = requireAdminOrScorer;
  createAuthMiddleware.createAuthMiddleware = createAuthMiddleware;
  createAuthMiddleware.authenticate = createAuthMiddleware;

  return createAuthMiddleware;
});

const mockContainer = {
  resolve: jest.fn((key) => {
    if (key === 'logger') return { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    if (key === 'config') return { get: jest.fn() };
    if (key === 'adminController') {
      return new Proxy({}, {
        get: (target, prop) => {
          if (prop === 'registerAdmin') return (req, res) => res.status(201).json({ success: true });
          return (req, res) => res.status(200).json({ success: true });
        }
      });
    }
    return {};
  })
};

const createAdminRoutes = require('./admin.routes');
app.use('/api/admin', createAdminRoutes(mockContainer));

describe('Admin Routes - Auth Guards', () => {
  describe('POST /api/admin/register', () => {
    it('should block unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(401);
    });

    it('should block requests from non-superadmin roles', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'admin') // authenticated but wrong role
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(403);
    });

    it('should allow requests from superadmin', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'superadmin')
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(201);
    });
  });

  // These two routes are the only ones guarded by requireAdminOrScorer. They
  // were previously uncovered, which is why the missing mock export went
  // unnoticed until the router failed to build.
  describe.each(['/api/admin/judges', '/api/admin/judges/summary'])(
    'GET %s (requireAdminOrScorer)',
    (route) => {
      // The guard runs before validateCompetitionContext, so an authorized
      // caller without competition context stops at 400 rather than 403 —
      // that 400 is what proves the guard let them through.
      const withContext = (req) => req.set('x-competition-id', 'comp-1');

      it('blocks unauthenticated requests', async () => {
        const response = await withContext(request(app).get(route));
        expect(response.status).toBe(401);
      });

      it('blocks a regular judge who is not a Scorer', async () => {
        const response = await withContext(
          request(app).get(route).set('Authorization', 'Bearer fake-token').set('Role', 'judge')
        );
        expect(response.status).toBe(403);
      });

      it('blocks a coach', async () => {
        const response = await withContext(
          request(app).get(route).set('Authorization', 'Bearer fake-token').set('Role', 'coach')
        );
        expect(response.status).toBe(403);
      });

      it('allows an admin', async () => {
        const response = await withContext(
          request(app).get(route).set('Authorization', 'Bearer fake-token').set('Role', 'admin')
        );
        expect(response.status).toBe(200);
      });

      it('allows a superadmin', async () => {
        const response = await withContext(
          request(app).get(route).set('Authorization', 'Bearer fake-token').set('Role', 'superadmin')
        );
        expect(response.status).toBe(200);
      });

      it('allows a judge whose judgeType is Scorer', async () => {
        const response = await withContext(
          request(app)
            .get(route)
            .set('Authorization', 'Bearer fake-token')
            .set('Role', 'judge')
            .set('JudgeType', 'Scorer')
        );
        expect(response.status).toBe(200);
      });

      it('still requires competition context once authorized', async () => {
        const response = await request(app)
          .get(route)
          .set('Authorization', 'Bearer fake-token')
          .set('Role', 'admin');
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('COMPETITION_CONTEXT_REQUIRED');
      });
    }
  );

  /**
   * The unlock route was registered as `/scores/unlock`, with a body validator
   * for `ageGroup`, while `adminController.unlockScores` reads
   * `req.params.scoreId` and calls the single-score `unlockScoreAsAdmin`. With
   * no `:scoreId` segment that argument was always undefined, so an admin
   * unlock could not work — and the web client
   * (`admin.api.js` → `PUT ${basePath}/scores/${scoreId}/unlock`) was 404ing
   * against a path the router never declared.
   */
  describe('PUT /api/admin/scores/:scoreId/unlock', () => {
    const scoreId = '507f1f77bcf86cd799439011'; // valid ObjectId for the param validator
    const route = `/api/admin/scores/${scoreId}/unlock`;

    it('is declared — the client path is no longer a 404', async () => {
      const response = await request(app)
        .put(route)
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'admin')
        .set('x-competition-id', 'comp-1');

      expect(response.status).not.toBe(404);
      expect(response.status).toBe(200);
    });

    it('blocks unauthenticated requests', async () => {
      const response = await request(app).put(route);
      expect(response.status).toBe(401);
    });

    it('blocks a non-admin role', async () => {
      const response = await request(app)
        .put(route)
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'coach');
      expect(response.status).toBe(403);
    });

    it('rejects a malformed scoreId', async () => {
      const response = await request(app)
        .put('/api/admin/scores/not-an-objectid/unlock')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'admin')
        .set('x-competition-id', 'comp-1');

      expect(response.status).toBe(400);
    });

    it('no longer serves the old body-based path', async () => {
      // Kept explicit: the old path could never unlock anything, and nothing
      // referenced it. If someone re-adds it, this says why that is wrong.
      const response = await request(app)
        .put('/api/admin/scores/unlock')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'admin')
        .set('x-competition-id', 'comp-1')
        .send({ ageGroup: 'Under14' });

      expect(response.status).toBe(404);
    });
  });
});
