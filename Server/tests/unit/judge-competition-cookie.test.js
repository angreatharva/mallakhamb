/**
 * Switching a judge's meet must move the COOKIE, not just the token in the body.
 *
 * `PUT /api/judge/competition/:id/set` mints an access token scoped to the new
 * competition. It used to return that token in JSON and stop there — but the
 * httpOnly cookie outranks the Authorization header: `auth.middleware` fills
 * `req.user.currentCompetition` from whichever token authenticated the request,
 * and the cookie is what does that. So a judge who picked Mumbai held a bearer
 * for Mumbai and a cookie for the meet login had silently chosen, and every
 * read behind `validateCompetitionContext` answered for the OLD meet.
 *
 * Nothing errored. `/public/save-score` takes the competition from its payload,
 * so the WRITES were correct; only the reads went elsewhere. The symptom was a
 * Senior Judge on Panel Review seeing "0 / 3 judges submitted" for an athlete
 * whose three slips were in the database — a panel that looks unjudged, on a
 * screen with nothing wrong with it.
 *
 * `/api/auth/set-competition`, the same operation for every other role, has
 * always set the cookie. This asserts the judge's endpoint does too.
 */

const { COOKIE_NAMES } = require('../../src/utils/security/cookie.util');

const JUDGE_ID = '6a8a9286fe57edf060353b19';
const NEW_COMPETITION = '6a8a9286fe57edf060353b1a';
const NEW_TOKEN = 'token.scoped.to.the.new.meet';

/**
 * The judge controller, wired with just enough to reach the handler.
 * @param {Object} [result] - what judgeService.setCompetitionContext returns
 */
function buildController(result = { token: NEW_TOKEN, competition: { _id: NEW_COMPETITION } }) {
  const createJudgeController = require('../../src/controllers/judge.controller');

  const container = {
    resolve: (key) => {
      if (key === 'judgeService') {
        return { setCompetitionContext: jest.fn().mockResolvedValue(result) };
      }
      if (key === 'logger') {
        return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      }
      if (key === 'config') return { get: jest.fn() };
      return {};
    },
  };

  return createJudgeController(container);
}

/** A response that records the cookies set on it. */
function buildResponse() {
  const cookies = [];
  return {
    cookies,
    cookie: jest.fn((name, value, options) => cookies.push({ name, value, options })),
    json: jest.fn(function json(body) { this.body = body; return this; }),
    status: jest.fn(function status() { return this; }),
  };
}

const request = () => ({ user: { _id: JUDGE_ID }, params: { competitionId: NEW_COMPETITION } });

describe('PUT /api/judge/competition/:competitionId/set', () => {
  it('rewrites the access-token cookie to the new competition', async () => {
    const controller = buildController();
    const res = buildResponse();

    await controller.setCompetitionContext(request(), res, jest.fn());

    // Undefined here means the cookie still names the previous meet, and every
    // read behind validateCompetitionContext will answer for that one.
    const accessCookie = res.cookies.find((c) => c.name === COOKIE_NAMES.ACCESS_TOKEN);
    expect(accessCookie).toBeDefined();
    expect(accessCookie.value).toBe(NEW_TOKEN);
  });

  it('keeps returning the token in the body, for clients holding a bearer', async () => {
    const controller = buildController();
    const res = buildResponse();

    await controller.setCompetitionContext(request(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ token: NEW_TOKEN }) })
    );
  });

  it('sets no cookie when the service mints no token', async () => {
    // Nothing to scope the session to; writing an empty cookie would sign the
    // judge out rather than leave them where they were.
    const controller = buildController({ competition: { _id: NEW_COMPETITION } });
    const res = buildResponse();

    await controller.setCompetitionContext(request(), res, jest.fn());

    expect(res.cookies.find((c) => c.name === COOKIE_NAMES.ACCESS_TOKEN)).toBeUndefined();
  });
});
