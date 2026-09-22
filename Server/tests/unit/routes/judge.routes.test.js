const request = require('supertest');
const express = require('express');

/**
 * Guard coverage for the judge running-order routes.
 *
 * The rule under test: every judge on a panel may READ the running order, but
 * only the Senior Judge and the Scorer may WRITE it. This is the role half of
 * the check — the assignment half (is this Senior Judge on THIS panel?) lives
 * in PerformanceOrderService.assertJudgeMaySequence and is covered in
 * tests/unit/performance-order.service.test.js. Both halves are required.
 */

// This mock must export every guard judge.routes.js imports at module scope.
// A missing guard resolves to `undefined` and Express throws
// "Route.put() requires a callback function" while the router is being BUILT,
// failing the whole suite at load time rather than in one test. Keep the shape
// in sync with module.exports at the bottom of src/middleware/auth.middleware.js.
jest.mock('../../../src/middleware/auth.middleware', () => {
  // A judge's token carries the meet they signed in for — JudgeService.loginJudge
  // puts the active competition in the claim — and the real middleware copies it
  // to `req.user.currentCompetition` and loads their seats FILTERED BY IT. The
  // Scorer read routes run behind `validateCompetitionContext`, which checks the
  // meet against those seats, so a mock that omits either half makes them 400 or
  // 403 for reasons that have nothing to do with the guards under test.
  const CONTEXT_COMPETITION = 'comp-1';

  const createAuthMiddleware = () => (req, res, next) => {
    if (!req.header('Authorization')) {
      return res.status(401).json({ message: 'No authorization token provided' });
    }
    req.userType = req.header('Role') || 'judge';
    // A judge principal is an ACCOUNT; the panel seats it holds are attached
    // separately by the real middleware, and that is what the guards read.
    req.user = {
      _id: 'account-1',
      name: 'Test User',
      role: req.header('Role') || undefined,
      currentCompetition: CONTEXT_COMPETITION,
      competitions: [CONTEXT_COMPETITION],
    };
    const judgeType = req.header('JudgeType');
    req.judgeAssignments = judgeType
      ? [{
          _id: 'seat-1',
          judgeType,
          competition: CONTEXT_COMPETITION,
          gender: 'Male',
          ageGroup: 'Under14',
          competitionTypes: ['competition_1'],
        }]
      : [];
    next();
  };

  const requireRole = (...allowedRoles) => (req, res, next) => {
    const roles = allowedRoles.flat();
    if (req.user && (roles.includes(req.userType) || roles.includes(req.user.role))) {
      return next();
    }
    return res.status(403).json({ message: 'Insufficient permissions' });
  };

  // Mirrors the real guard, including the fact that it reads the judge's
  // SEATS rather than a role on the principal — a judge can chair one panel
  // and merely score on another.
  const requireSequenceManager = (req, res, next) => {
    if (!req.user || !req.userType) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const isAdmin = ['admin', 'superadmin'].includes(req.userType) ||
                    (req.user.role && ['admin', 'superadmin'].includes(req.user.role));
    const canSequence = req.userType === 'judge' &&
                        (req.judgeAssignments || []).some((a) =>
                          ['Senior Judge', 'Scorer'].includes(a.judgeType));
    if (!isAdmin && !canSequence) {
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
  createAuthMiddleware.requireAdminOrScorer = (req, res, next) => next();
  createAuthMiddleware.requireSequenceManager = requireSequenceManager;
  createAuthMiddleware.createAuthMiddleware = createAuthMiddleware;
  createAuthMiddleware.authenticate = createAuthMiddleware;

  return createAuthMiddleware;
});

const mockContainer = {
  resolve: jest.fn((key) => {
    if (key === 'logger') return { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    if (key === 'config') return { get: jest.fn() };
    if (typeof key === 'string' && key.endsWith('Controller')) {
      return new Proxy({}, { get: () => (req, res) => res.status(200).json({ success: true }) });
    }
    return {};
  }),
};

const createJudgeRoutes = require('../../../src/routes/judge.routes');

const app = express();
app.use(express.json());
app.use('/api/judge', createJudgeRoutes(mockContainer));

const VALID_CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

/**
 * The flat score endpoints are retired and must stay retired.
 *
 * All three wrote or read `{ player, judge, score }` on a 0-100 scale against a
 * schema that has none of those paths and stores marks 0-10 inside
 * `playerScores[].judgeScores`. Strict mode dropped every field on write and the
 * `my` read threw StrictPopulateError — so one endpoint silently stored nothing
 * and the other answered 500, for their whole existence.
 *
 * They were a SECOND way to write the score collection. `/scores/save` below is
 * the real one, and these assertions exist so nobody restores a duplicate write
 * surface by reflex when they find a 404 in a log.
 */
describe('retired flat score endpoints', () => {
  const authed = (req) => req
    .set('Authorization', 'Bearer fake-token')
    .set('Role', 'judge')
    .set('JudgeType', 'Judge 1');

  it('POST /api/judge/scores is gone', async () => {
    const response = await authed(
      request(app).post('/api/judge/scores').send({
        playerId: '507f1f77bcf86cd799439011',
        teamId: '507f1f77bcf86cd799439012',
        score: 87,
      })
    );
    expect(response.status).toBe(404);
  });

  it('PUT /api/judge/scores/:scoreId is gone', async () => {
    const response = await authed(
      request(app).put('/api/judge/scores/507f1f77bcf86cd799439013').send({ score: 91 })
    );
    expect(response.status).toBe(404);
  });

  it('GET /api/judge/scores/my is gone', async () => {
    const response = await authed(request(app).get('/api/judge/scores/my'));
    expect(response.status).toBe(404);
  });

  it('POST /api/judge/scores/save — the real write path — still works', async () => {
    const response = await authed(
      request(app).post('/api/judge/scores/save').send({
        teamId: '507f1f77bcf86cd799439012',
        gender: 'Male',
        ageGroup: 'Under14',
        playerId: '507f1f77bcf86cd799439011',
        score: 8.7,
      })
    );
    expect(response.status).toBe(200);
  });

  it('GET /api/judge/scores/team — the Scorer read — still works', async () => {
    const response = await authed(request(app).get('/api/judge/scores/team'));
    expect(response.status).toBe(200);
  });
});

describe('GET /api/judge/lots', () => {
  it('blocks unauthenticated requests', async () => {
    const response = await request(app).get('/api/judge/lots').query(VALID_CATEGORY);
    expect(response.status).toBe(401);
  });

  it('allows an evaluation judge to READ the order', async () => {
    // The four evaluation judges have to see the order they are judging to.
    const response = await request(app)
      .get('/api/judge/lots')
      .query(VALID_CATEGORY)
      .set('Authorization', 'Bearer fake-token')
      .set('Role', 'judge')
      .set('JudgeType', 'Judge 2');

    expect(response.status).toBe(200);
  });

  it('rejects a request missing the category', async () => {
    const response = await request(app)
      .get('/api/judge/lots')
      .set('Authorization', 'Bearer fake-token')
      .set('Role', 'judge')
      .set('JudgeType', 'Senior Judge');

    expect(response.status).toBe(400);
  });
});

describe.each([
  ['/api/judge/lots/teams', { ...VALID_CATEGORY, teamIds: ['507f1f77bcf86cd799439011'] }],
  ['/api/judge/lots/players', {
    ...VALID_CATEGORY,
    teamId: '507f1f77bcf86cd799439011',
    playerIds: ['507f1f77bcf86cd799439012'],
  }],
])('PUT %s', (route, body) => {
  const send = (headers = {}) => {
    let req = request(app).put(route).send(body);
    Object.entries(headers).forEach(([k, v]) => { req = req.set(k, v); });
    return req;
  };

  it('blocks unauthenticated requests', async () => {
    const response = await send();
    expect(response.status).toBe(401);
  });

  it('blocks a coach', async () => {
    const response = await send({ Authorization: 'Bearer fake-token', Role: 'coach' });
    expect(response.status).toBe(403);
  });

  it('blocks an evaluation judge on the panel', async () => {
    const response = await send({
      Authorization: 'Bearer fake-token', Role: 'judge', JudgeType: 'Judge 1',
    });
    expect(response.status).toBe(403);
  });

  it('allows the Senior Judge', async () => {
    const response = await send({
      Authorization: 'Bearer fake-token', Role: 'judge', JudgeType: 'Senior Judge',
    });
    expect(response.status).toBe(200);
  });

  it('allows the Scorer', async () => {
    const response = await send({
      Authorization: 'Bearer fake-token', Role: 'judge', JudgeType: 'Scorer',
    });
    expect(response.status).toBe(200);
  });

  it('rejects a malformed id list even from the Senior Judge', async () => {
    const response = await request(app)
      .put(route)
      .send({ ...body, teamIds: ['not-an-objectid'], playerIds: ['not-an-objectid'] })
      .set('Authorization', 'Bearer fake-token')
      .set('Role', 'judge')
      .set('JudgeType', 'Senior Judge');

    expect(response.status).toBe(400);
  });
});
