/**
 * Contact number persistence and validation.
 *
 * Regression guard for a silent data-loss bug: the registration forms collected
 * `phone` and the clients sent it, but neither the Player nor the Coach schema
 * declared the field. Mongoose strict mode discards undeclared paths without
 * raising anything, so registration returned 201 and the number simply was not
 * there. Nothing failed, which is why it went unnoticed.
 *
 * The round-trip assertions below are the point — asserting the schema has a
 * `phone` path would pass against a model that still dropped the value.
 */

const { validationResult } = require('express-validator');
const Player = require('../../models/Player');
const Coach = require('../../models/Coach');
const { phone } = require('../../src/validators/common.validator');

const playerFixture = (overrides = {}) => ({
  firstName: 'Test',
  lastName: 'Player',
  email: `player-${Math.random().toString(36).slice(2)}@example.com`,
  dateOfBirth: new Date('2000-01-01'),
  password: 'CorrectHorse1!',
  gender: 'Male',
  ...overrides,
});

const coachFixture = (overrides = {}) => ({
  name: 'Test Coach',
  email: `coach-${Math.random().toString(36).slice(2)}@example.com`,
  password: 'CorrectHorse1!',
  ...overrides,
});

/**
 * Run an express-validator chain against a fake request body.
 * @param {import('express-validator').ValidationChain} chain
 * @param {Object} body
 * @returns {Promise<string[]>} error messages, empty when the body is valid
 */
const runChain = async (chain, body) => {
  const req = { body };
  await chain.run(req);
  return validationResult(req).array().map((e) => e.msg);
};

describe('phone persistence', () => {
  it('stores a player phone number and reads it back', async () => {
    const created = await Player.create(playerFixture({ phone: '9619206753' }));
    const reloaded = await Player.findById(created._id);

    expect(reloaded.phone).toBe('9619206753');
  });

  it('stores a coach phone number and reads it back', async () => {
    const created = await Coach.create(coachFixture({ phone: '9619206753' }));
    const reloaded = await Coach.findById(created._id);

    expect(reloaded.phone).toBe('9619206753');
  });

  it('trims surrounding whitespace', async () => {
    const created = await Player.create(playerFixture({ phone: '  9619206753  ' }));

    expect(created.phone).toBe('9619206753');
  });

  it('leaves accounts that predate the field saveable', async () => {
    // Registered before `phone` existed, so it has none. Requiring the field on
    // the schema would make this save throw and lock the account out of every
    // ordinary update, which is why it is optional there and enforced at the
    // API boundary instead.
    const legacy = await Player.create(playerFixture());
    expect(legacy.phone).toBeNull();

    legacy.lastName = 'Renamed';
    await expect(legacy.save()).resolves.toBeDefined();
  });
});

describe('phone validator', () => {
  it.each([
    ['plain 10-digit', '9619206753'],
    ['country code', '+91 9619206753'],
    ['separators', '(961) 920-6753'],
  ])('accepts %s', async (_label, value) => {
    expect(await runChain(phone('phone'), { phone: value })).toEqual([]);
  });

  it.each([
    ['too short', '96192'],
    ['too long', '12345678901234567'],
    ['no digits', 'call me'],
  ])('rejects %s', async (_label, value) => {
    expect(await runChain(phone('phone'), { phone: value }))
      .toContain('Phone number must contain between 10 and 15 digits');
  });

  it('requires the field by default', async () => {
    expect(await runChain(phone('phone'), {})).toContain('Phone number is required');
  });

  it('skips an absent value when optional', async () => {
    expect(await runChain(phone('phone', { isOptional: true }), {})).toEqual([]);
  });

  it('still checks an optional value that is present', async () => {
    expect(await runChain(phone('phone', { isOptional: true }), { phone: '123' }))
      .toContain('Phone number must contain between 10 and 15 digits');
  });
});
