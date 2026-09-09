/**
 * An admin may only act on the meets they are assigned to.
 *
 * `Admin.competitions[]` is the authoritative list — `scripts/createCompetitions.js`
 * says so, and `/api/auth/competitions/assigned` reads it to build the picker
 * the admin UI shows. Nothing enforced it.
 *
 * Two halves were open at once:
 *
 *   - `AuthenticationService.setCompetitionContext` carried
 *     `// TODO: Validate user has access to competition` and minted a token
 *     for any competition that existed;
 *   - `validateCompetitionContext` — which fronts every route in
 *     `admin.routes.js` — accepted the meet from `X-Competition-Id`, the body
 *     or the query with no check at all.
 *
 * So an admin for the Pune meet could read and write the Nagpur meet's teams,
 * players, judges, scores and transactions by naming it in a header. The real
 * client never does that (`Web/src/services/api-client.js` derives the header
 * from the token it already holds), which is exactly why nothing surfaced it.
 *
 * These exercise the rule directly rather than through a mounted app: the
 * middleware is a pure function of the request, and the decision itself lives
 * in `utils/security/competition-access.util`.
 */

const mongoose = require('mongoose');

const { validateCompetitionContext } = require('../../src/middleware/competition-context.middleware');
const {
  mayActOnCompetition,
  isCompetitionScoped,
} = require('../../src/utils/security/competition-access.util');
const AuthenticationService = require('../../src/services/auth/authentication.service');
const { AuthorizationError, NotFoundError } = require('../../src/errors');

const oid = () => new mongoose.Types.ObjectId();

const MINE = oid();
const THEIRS = oid();

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** A fake res that records the status and body a middleware terminated with. */
function recorder() {
  const sent = {};
  return {
    sent,
    status(code) {
      sent.status = code;
      return this;
    },
    json(body) {
      sent.body = body;
      return this;
    },
  };
}

/**
 * Run the middleware once.
 * @param {Object} req - Partial request; `user`/`userType`/`headers` as needed
 * @returns {{sent: Object, nexted: boolean, competitionId: *}}
 */
function run(req) {
  const res = recorder();
  let nexted = false;
  validateCompetitionContext(
    { headers: {}, body: {}, query: {}, ...req },
    res,
    () => { nexted = true; }
  );
  return { sent: res.sent, nexted, competitionId: req.competitionId };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('validateCompetitionContext refuses a meet the admin is not assigned to', () => {
  const admin = { _id: oid(), role: 'admin', competitions: [MINE] };

  it('still lets an assigned admin through, from the header', () => {
    const { sent, nexted } = run({
      user: admin,
      userType: 'admin',
      headers: { 'x-competition-id': String(MINE) },
    });

    expect(sent.status).toBeUndefined();
    expect(nexted).toBe(true);
  });

  it('refuses a header naming another meet', () => {
    const { sent, nexted } = run({
      user: admin,
      userType: 'admin',
      headers: { 'x-competition-id': String(THEIRS) },
    });

    expect(nexted).toBe(false);
    expect(sent.status).toBe(403);
    expect(sent.body.error.code).toBe('COMPETITION_ACCESS_DENIED');
  });

  it('refuses it in the body and in the query too', () => {
    expect(run({ user: admin, userType: 'admin', body: { competitionId: String(THEIRS) } }).sent.status)
      .toBe(403);
    expect(run({ user: admin, userType: 'admin', query: { competitionId: String(THEIRS) } }).sent.status)
      .toBe(403);
  });

  it('refuses a token claim for a meet the admin has since been removed from', () => {
    // The token outlives the assignment, so the claim is checked as well —
    // not only the caller-supplied fallbacks.
    const { sent, nexted } = run({
      user: { ...admin, currentCompetition: String(THEIRS) },
      userType: 'admin',
    });

    expect(nexted).toBe(false);
    expect(sent.status).toBe(403);
  });

  it('still answers 400, not 403, when no meet is named at all', () => {
    const { sent } = run({ user: admin, userType: 'admin' });

    expect(sent.status).toBe(400);
    expect(sent.body.error.code).toBe('COMPETITION_CONTEXT_REQUIRED');
  });

  it('lets a superadmin through for any meet', () => {
    const { nexted } = run({
      user: { _id: oid(), role: 'superadmin', competitions: [] },
      userType: 'superadmin',
      headers: { 'x-competition-id': String(THEIRS) },
    });

    expect(nexted).toBe(true);
  });
});

describe('the rule is not applied to principals it would break', () => {
  it('lets a coach name a meet they have no registration in yet', () => {
    // First registration is exactly this request: a coach with no relationship
    // to the meet asking to enter it. Scoping them by membership would make
    // registering impossible. See the header of competition-access.util.
    const { nexted } = run({
      user: { _id: oid(), competitions: undefined },
      userType: 'coach',
      headers: { 'x-competition-id': String(THEIRS) },
    });

    expect(nexted).toBe(true);
    expect(isCompetitionScoped('coach')).toBe(false);
  });

  it('lets a player through the same way', () => {
    expect(run({
      user: { _id: oid() },
      userType: 'player',
      headers: { 'x-competition-id': String(THEIRS) },
    }).nexted).toBe(true);
  });
});

describe('a judge is scoped by their seat, not by an account field', () => {
  const seatAt = (competition) => ({ competition, gender: 'Male', ageGroup: 'Under14' });

  it('lets a judge through for a meet they hold a seat at', () => {
    const { nexted } = run({
      user: { _id: oid() },
      userType: 'judge',
      judgeAssignments: [seatAt(MINE)],
      headers: { 'x-competition-id': String(MINE) },
    });

    expect(nexted).toBe(true);
  });

  it('refuses a Scorer who names a meet they hold no seat at', () => {
    // `requireAdminOrScorer` admits judges to the admin score routes, so this
    // is the path a Scorer takes — and their assignments are loaded per-token
    // by auth.middleware, not read off the request.
    const { sent, nexted } = run({
      user: { _id: oid() },
      userType: 'judge',
      judgeAssignments: [seatAt(MINE)],
      headers: { 'x-competition-id': String(THEIRS) },
    });

    expect(nexted).toBe(false);
    expect(sent.status).toBe(403);
  });

  it('refuses an unassigned judge outright', () => {
    expect(run({
      user: { _id: oid() },
      userType: 'judge',
      judgeAssignments: [],
      headers: { 'x-competition-id': String(MINE) },
    }).sent.status).toBe(403);
  });

  it('pins the meet on the request, which is what defeats ?competition=', () => {
    // `/api/judge/scores/team`, `/judges` and `/judges/summary` reach
    // admin.controller, and `competitionIdFromRequest` reads
    // `req.query.competition` when nothing has put a meet on the request. This
    // middleware sets `req.competitionId`, which is FIRST in that chain — so a
    // judge naming another meet in the query string is ignored, not obeyed.
    const req = {
      headers: {},
      body: {},
      query: { competition: String(THEIRS) },
      user: { _id: oid(), currentCompetition: String(MINE) },
      userType: 'judge',
      judgeAssignments: [seatAt(MINE)],
    };
    const res = recorder();
    let nexted = false;
    validateCompetitionContext(req, res, () => { nexted = true; });

    expect(nexted).toBe(true);
    expect(String(req.competitionId)).toBe(String(MINE));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('setCompetitionContext will not mint a token for an unassigned meet', () => {
  const adminId = oid();

  /**
   * @param {Array} competitions - what `Admin.competitions` holds
   * @param {string} [role]
   */
  function buildService(competitions, role = 'admin') {
    const adminRepository = {
      findById: async () => ({ _id: adminId, role, competitions }),
    };
    const competitionRepository = {
      findById: async (id) => ({ _id: id, name: 'Test Meet' }),
    };

    return new AuthenticationService(
      null,                      // playerRepository
      null,                      // coachRepository
      adminRepository,
      null,                      // judgeRepository
      competitionRepository,
      { generateToken: (u, t, c) => `token:${u}:${t}:${c}` },
      null,                      // otpService
      quiet
    );
  }

  it('issues a token for a meet the admin is assigned to', async () => {
    const service = buildService([MINE]);

    const result = await service.setCompetitionContext(adminId, 'admin', String(MINE));

    expect(result.token).toBe(`token:${adminId}:admin:${MINE}`);
    expect(result.competition._id).toBe(String(MINE));
  });

  it('refuses a meet the admin is not assigned to', async () => {
    const service = buildService([MINE]);

    await expect(service.setCompetitionContext(adminId, 'admin', String(THEIRS)))
      .rejects.toThrow(AuthorizationError);
  });

  it('refuses an admin with no assignments at all', async () => {
    const service = buildService([]);

    await expect(service.setCompetitionContext(adminId, 'admin', String(MINE)))
      .rejects.toThrow(AuthorizationError);
  });

  it('issues a token to a superadmin for any meet', async () => {
    const service = buildService([], 'superadmin');

    await expect(service.setCompetitionContext(adminId, 'superadmin', String(THEIRS)))
      .resolves.toMatchObject({ token: expect.any(String) });
  });

  it('sends judges to their own route rather than answering here', async () => {
    // This service cannot read `judgeassignments`; JudgeService can, and does.
    const service = buildService([MINE]);

    await expect(service.setCompetitionContext(oid(), 'judge', String(MINE)))
      .rejects.toThrow(AuthorizationError);
  });

  it('still reports a missing competition as not-found, before any access check', async () => {
    const service = buildService([MINE]);
    service.competitionRepository = { findById: async () => null };

    await expect(service.setCompetitionContext(adminId, 'admin', String(THEIRS)))
      .rejects.toThrow(NotFoundError);
  });
});

describe('mayActOnCompetition', () => {
  it('compares ids as strings, so an ObjectId assignment matches its hex form', () => {
    expect(mayActOnCompetition({ competitions: [MINE] }, 'admin', String(MINE))).toBe(true);
    expect(mayActOnCompetition({ competitions: [String(MINE)] }, 'admin', MINE)).toBe(true);
  });

  it('denies an admin with no competitions field at all', () => {
    expect(mayActOnCompetition({}, 'admin', String(MINE))).toBe(false);
    expect(mayActOnCompetition(null, 'admin', String(MINE))).toBe(false);
  });
});
