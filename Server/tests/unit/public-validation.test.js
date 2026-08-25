/**
 * Validation on the anonymous public endpoints.
 *
 * Two claims worth pinning, because they pull in opposite directions:
 *
 *   1. A malformed `competitionId` is refused at the edge, with a message
 *      naming the query parameter — not Mongoose's `Invalid _id: ...`, which
 *      names an internal field and only appears after a database round trip.
 *
 *   2. NO `competitionId` is still valid. `/scores` returns every published
 *      score that way and `/teams` returns an empty list; requiring the field
 *      would turn two working calls into 400s. This is the half that a
 *      well-meaning tightening of the rule would break silently.
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

  it('accepts no competition id at all', async () => {
    // The endpoints work without it. If this ever fails, the public score and
    // team listings have started 400ing for every caller that omits the filter.
    expect(await runChain(build(), {})).toEqual([]);
  });

  it('accepts an empty competition id, which a client sends as ?competitionId=', async () => {
    expect(await runChain(build(), { competitionId: '' })).toEqual([]);
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
