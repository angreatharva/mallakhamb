/**
 * public.routes.test.js
 *
 * Tests for the public routes factory:
 * - Each route delegates to the correct controller method
 * - optionalAuth passes through when no token is present
 * - optionalAuth populates req.user and req.competitionId when a valid token is present
 *
 * Requirements: 1.3, 3.9
 */

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createPublicRoutes = require('./public.routes');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock admin controller where every method is a jest.fn() that
 * responds with 200 { success: true } by default.
 */
function buildAdminController(overrides = {}) {
  const handler = (name) =>
    jest.fn((req, res) => res.status(200).json({ success: true, handler: name, competitionId: req.competitionId, user: req.user }));

  return {
    getPublicCompetitions: handler('getPublicCompetitions'),
    getJudges: handler('getJudges'),
    getSubmittedTeams: handler('getSubmittedTeams'),
    getPublicTeams: handler('getPublicTeams'),
    getPublicScores: handler('getPublicScores'),
    saveScores: handler('saveScores'),
    ...overrides,
  };
}

/**
 * Build a mock payment controller.
 */
function buildPaymentController(overrides = {}) {
  return {
    reconcileRazorpayWebhook: jest.fn((req, res) =>
      res.status(200).json({ success: true, handler: 'reconcileRazorpayWebhook' })
    ),
    ...overrides,
  };
}

/**
 * Build a DI container mock that resolves adminController and paymentController.
 */
function buildContainer(adminController, paymentController) {
  return {
    resolve: (name) => {
      if (name === 'adminController') return adminController;
      if (name === 'paymentController') return paymentController;
      throw new Error(`Unknown service: ${name}`);
    },
  };
}

/**
 * Create a minimal Express app with the public router mounted at /api/public.
 */
function buildApp(adminController, paymentController) {
  const app = express();
  app.use(express.json());
  const container = buildContainer(adminController, paymentController);
  const publicRouter = createPublicRoutes(container);
  app.use('/api/public', publicRouter);
  return app;
}

// ── route delegation tests ────────────────────────────────────────────────────

describe('createPublicRoutes — route delegation', () => {
  let adminCtrl, paymentCtrl, app;

  beforeEach(() => {
    adminCtrl = buildAdminController();
    paymentCtrl = buildPaymentController();
    app = buildApp(adminCtrl, paymentCtrl);
  });

  it('GET /api/public/competitions → adminController.getPublicCompetitions (200)', async () => {
    const res = await request(app).get('/api/public/competitions');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getPublicCompetitions');
    expect(adminCtrl.getPublicCompetitions).toHaveBeenCalledTimes(1);
  });

  it('GET /api/public/judges → adminController.getJudges (200)', async () => {
    const res = await request(app).get('/api/public/judges');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getJudges');
    expect(adminCtrl.getJudges).toHaveBeenCalledTimes(1);
  });

  it('GET /api/public/submitted-teams → adminController.getSubmittedTeams (200)', async () => {
    const res = await request(app).get('/api/public/submitted-teams');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getSubmittedTeams');
    expect(adminCtrl.getSubmittedTeams).toHaveBeenCalledTimes(1);
  });

  it('GET /api/public/teams → adminController.getPublicTeams (200)', async () => {
    const res = await request(app).get('/api/public/teams');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getPublicTeams');
    expect(adminCtrl.getPublicTeams).toHaveBeenCalledTimes(1);
  });

  it('GET /api/public/scores → adminController.getPublicScores (200)', async () => {
    const res = await request(app).get('/api/public/scores');
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('getPublicScores');
    expect(adminCtrl.getPublicScores).toHaveBeenCalledTimes(1);
  });

  it('POST /api/public/save-score → adminController.saveScores (200)', async () => {
    const res = await request(app).post('/api/public/save-score').send({ teamId: 't1' });
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('saveScores');
    expect(adminCtrl.saveScores).toHaveBeenCalledTimes(1);
  });

  it('POST /api/public/payments/razorpay/webhook → paymentController.reconcileRazorpayWebhook (200)', async () => {
    const res = await request(app)
      .post('/api/public/payments/razorpay/webhook')
      .send({ event: 'payment.captured' });
    expect(res.status).toBe(200);
    expect(res.body.handler).toBe('reconcileRazorpayWebhook');
    expect(paymentCtrl.reconcileRazorpayWebhook).toHaveBeenCalledTimes(1);
  });
});

// ── optionalAuth middleware tests ─────────────────────────────────────────────

describe('optionalAuth middleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

  let adminCtrl, paymentCtrl, app;

  beforeEach(() => {
    adminCtrl = buildAdminController();
    paymentCtrl = buildPaymentController();
    app = buildApp(adminCtrl, paymentCtrl);
  });

  it('passes through without error when no Authorization header is present', async () => {
    const res = await request(app).get('/api/public/judges');
    expect(res.status).toBe(200);
    // req.user should be undefined (not set by optionalAuth)
    expect(res.body.user).toBeUndefined();
  });

  it('passes through without error when Authorization header is malformed', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', 'NotBearer something');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it('passes through without error when token is invalid/expired', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it('populates req.user when a valid token is present', async () => {
    const token = jwt.sign(
      { id: 'user-123', role: 'admin', userId: 'user-123', userType: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user._id).toBe('user-123');
  });

  it('populates req.competitionId from token currentCompetition field', async () => {
    const token = jwt.sign(
      { id: 'user-123', role: 'admin', currentCompetition: 'comp-456' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.competitionId).toBe('comp-456');
  });

  it('populates req.competitionId from token competitionId field', async () => {
    const token = jwt.sign(
      { id: 'user-123', role: 'admin', competitionId: 'comp-789' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.competitionId).toBe('comp-789');
  });

  it('optionalAuth is applied to /submitted-teams — passes through without token', async () => {
    const res = await request(app).get('/api/public/submitted-teams');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it('optionalAuth is applied to /save-score — passes through without token', async () => {
    const res = await request(app).post('/api/public/save-score').send({});
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it('optionalAuth populates context on /submitted-teams with valid token', async () => {
    const token = jwt.sign(
      { id: 'user-abc', role: 'judge', currentCompetition: 'comp-abc' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/public/submitted-teams')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user._id).toBe('user-abc');
    expect(res.body.competitionId).toBe('comp-abc');
  });
});
