/**
 * Validation on the anonymous public endpoints.
 *
 * Three claims worth pinning:
 *
 *   1. A malformed `competitionId` is refused at the edge, with a message
 *      naming the query parameter — not Mongoose's `Invalid _id: ...`, which
 *      names an internal field and only appears after a database round trip.
 *
 *   2. `/scores` REQUIRES a competition. It used not to, and this file used to
 *      pin that: omitting it returned every published score in the database,
 *      unpaginated, to an anonymous caller — 19.5 MB on one 1000-team fixture,
 *      unbounded across several competitions. Both callers in the web client
 *      always send it, so nothing that worked now 400s. The old expectation is
 *      inverted below rather than deleted, so the reversal is visible.
 *
 *   3. `/teams` still accepts no competition, because it answers with an empty
 *      list rather than with everything, and so has no equivalent failure mode.
 */

const { validationResult } = require('express-validator');
const publicValidator = require('../../src/validators/public.validator');
const { objectId } = require('../../src/validators/common.validator');

/**
 * Run a validator chain against a fake request.
 * @param {import('express-validator').ValidationChain[]} chain
 * @param {Object} query
 * @returns {Promise<string[]>} error messages, empty when the request is valid
 */
const runChain = async (chain, query) => {
  const req = { query, body: {}, params: {} };
  for (const rule of chain) await rule.run(req);
  return validationResult(req).array().map((e) => e.msg);
};

describe.each([
  ['getPublicScores', () => publicValidator.getPublicScores()],
  ['getPublicTeams', () => publicValidator.getPublicTeams()],
])('%s', (_name, build) => {
  it('accepts a well-formed competition id', async () => {
    expect(await runChain(build(), { competitionId: '6a8a9286fe57edf060353b19' })).toEqual([]);
  });

  it('refuses a malformed competition id, naming the query parameter', async () => {
    const errors = await runChain(build(), { competitionId: 'not-an-id' });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('Invalid competitionId format');
    // Mongoose's own refusal says "Invalid _id"; the point of validating here
    // is that the caller is told which parameter THEY got wrong.
    expect(errors[0]).not.toMatch(/_id/);
  });

  it('refuses an id of the right length that is not hex', async () => {
    expect(await runChain(build(), { competitionId: 'z'.repeat(24) }))
      .toEqual(['Invalid competitionId format']);
  });
});

describe('the two endpoints differ on a MISSING competition', () => {
  const missing = [{}, { competitionId: '' }];

  it.each(missing)('getPublicScores refuses %j', async (query) => {
    // Claim 2. Without this the endpoint answers with every published score in
    // the database — see the header note.
    const errors = await runChain(publicValidator.getPublicScores(), query);
    expect(errors).toContain('competitionId is required');
  });

  it.each(missing)('getPublicTeams still accepts %j', async (query) => {
    // Claim 3. It returns an empty list, not everything, so requiring it here
    // would turn a working call into a 400 for no gain.
    expect(await runChain(publicValidator.getPublicTeams(), query)).toEqual([]);
  });
});

describe('getPublicScores teamId', () => {
  it('accepts a well-formed team id', async () => {
    expect(await runChain(publicValidator.getPublicScores(), {
      competitionId: '6a8a9286fe57edf060353b19',
      teamId: '6a8a9286fe57edf060353b1a',
    })).toEqual([]);
  });

  it('is optional', async () => {
    expect(await runChain(publicValidator.getPublicScores(), {
      competitionId: '6a8a9286fe57edf060353b19',
    })).toEqual([]);
  });

  it('refuses a malformed team id', async () => {
    expect(await runChain(publicValidator.getPublicScores(), {
      competitionId: '6a8a9286fe57edf060353b19',
      teamId: 'not-an-id',
    })).toEqual(['Invalid teamId format']);
  });
});

describe('objectId({ isOptional })', () => {
  it('still requires the field by default', async () => {
    // The optional variant is opt-in: every existing caller passes two
    // arguments and must keep getting a required check.
    //
    // A missing value trips both the notEmpty rule and the format check, so
    // two messages come back. That is how objectId behaved before the option
    // was added and is left alone here — asserting the exact pair would pin
    // behaviour this change is not responsible for.
    expect(await runChain([objectId('competitionId', 'query')], {}))
      .toContain('competitionId is required');
  });
});
