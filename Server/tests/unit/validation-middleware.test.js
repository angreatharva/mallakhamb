/**
 * handleValidationErrors — the shape of a 400 body.
 *
 * Every validated endpoint in the API funnels through here, so the field names
 * in `details` are what any client has to key its form errors off. They were
 * all the literal string "undefined": the formatter read `err.param`, which
 * express-validator 7 renamed to `err.path`. Worse than a cosmetic slip —
 * because every error shared that one key, a request with three bad fields
 * reported only the last one.
 */

const { body, query, validationResult } = require('express-validator');
const { handleValidationErrors } = require('../../src/middleware/validation.middleware');

/**
 * Run rules against a request, then the formatter, and return what the error
 * handler would have been given.
 *
 * @param {import('express-validator').ValidationChain[]} rules
 * @param {Object} req
 * @returns {Promise<{details: Object}|null>} null when the request is valid
 */
const format = async (rules, req) => {
  const request = { body: {}, query: {}, params: {}, ...req };
  for (const rule of rules) await rule.run(request);

  let captured = null;
  // A valid request calls next() with no argument at all, so normalise it —
  // otherwise "passed through cleanly" arrives as undefined rather than null.
  handleValidationErrors(request, {}, (err) => { captured = err ?? null; });
  return captured;
};

describe('handleValidationErrors', () => {
  it('keys each message by its field name', async () => {
    const error = await format(
      [body('email').isEmail().withMessage('Valid email is required')],
      { body: { email: 'nope' } }
    );

    expect(error.details).toEqual({ email: 'Valid email is required' });
    expect(Object.keys(error.details)).not.toContain('undefined');
  });

  it('reports every invalid field, not just the last one', async () => {
    // The regression that matters: three bad fields collapsing into one key
    // told the user about one problem and hid the other two.
    const error = await format(
      [
        body('email').isEmail().withMessage('Valid email is required'),
        body('phone').isLength({ min: 10 }).withMessage('Phone is too short'),
        body('password').isLength({ min: 8 }).withMessage('Password is too short'),
      ],
      { body: { email: 'nope', phone: '123', password: 'abc' } }
    );

    expect(error.details).toEqual({
      email: 'Valid email is required',
      phone: 'Phone is too short',
      password: 'Password is too short',
    });
  });

  it('names a query parameter as precisely as a body field', async () => {
    const error = await format(
      [query('competitionId').isMongoId().withMessage('Invalid competitionId format')],
      { query: { competitionId: 'not-an-id' } }
    );

    expect(error.details).toEqual({ competitionId: 'Invalid competitionId format' });
  });

  it('passes a valid request straight through', async () => {
    const error = await format(
      [body('email').isEmail()],
      { body: { email: 'someone@example.com' } }
    );

    expect(error).toBeNull();
  });
});
