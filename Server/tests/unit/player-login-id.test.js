/**
 * The Player ID format and the registration rules for the three first-screen
 * choices (own email / guardian's email / none).
 */

const { validationResult } = require('express-validator');
const {
  baseLoginId,
  nextFreeLoginId,
  normalizeLoginId,
  siblingsPattern,
  LOGIN_ID_PATTERN,
  emailTypeOf,
} = require('../../src/utils/data/player-login-id.util');
const { accountIdentifier } = require('../../src/validators/common.validator');
const { createPlayer } = require('../../src/validators/player.validator');

const runChains = async (chains, body) => {
  const req = { body };
  for (const chain of chains) await chain.run(req);
  return { errors: validationResult(req).array().map((e) => `${e.path}: ${e.msg}`), body: req.body };
};

describe('Player ID format', () => {
  test('firstname.lastname.ddmmyy, lower-case', () => {
    expect(baseLoginId('Aarav', 'Patil', '2016-06-15')).toBe('aarav.patil.150616');
  });

  test('reads the birthday in UTC, the way a date-only value is stored', () => {
    expect(baseLoginId('A', 'B', new Date('2015-01-02T00:00:00Z'))).toBe('a.b.020115');
  });

  test('spaces, punctuation and accents are dropped', () => {
    expect(baseLoginId('Sai Krishna', "D'Souza", '2016-06-15')).toBe('saikrishna.dsouza.150616');
    expect(baseLoginId('José', 'Núñez', '2016-06-15')).toBe('jose.nunez.150616');
  });

  test('undoes the validator HTML-escaping first, so no stray letters creep in', () => {
    expect(baseLoginId('O&#x27;Brien', 'Smith', '2016-06-15')).toBe('obrien.smith.150616');
  });

  test('a missing last name is left out, not left as an empty segment', () => {
    expect(baseLoginId('Aarav', '', '2016-06-15')).toBe('aarav.150616');
  });

  test('a first name with no Latin letters falls back to "player"', () => {
    expect(baseLoginId('आरव', 'पाटील', '2016-06-15')).toBe('player.150616');
  });

  test('no date of birth, no ID', () => {
    expect(baseLoginId('A', 'B', 'not a date')).toBeNull();
  });

  test('duplicates take the lowest free suffix, starting at .2', () => {
    expect(nextFreeLoginId('a.b.1', [])).toBe('a.b.1');
    expect(nextFreeLoginId('a.b.1', ['a.b.1'])).toBe('a.b.1.2');
    expect(nextFreeLoginId('a.b.1', ['a.b.1', 'a.b.1.2', 'a.b.1.4'])).toBe('a.b.1.3');
  });

  test('the sibling pattern matches the base and its suffixes only', () => {
    const pattern = siblingsPattern('a.b.150616');
    expect(pattern.test('a.b.150616')).toBe(true);
    expect(pattern.test('a.b.150616.7')).toBe(true);
    expect(pattern.test('a.b.150616x')).toBe(false);
    expect(pattern.test('axb.150616')).toBe(false);
  });

  test('what a user types is normalised to the stored form', () => {
    expect(normalizeLoginId('  Aarav.Patil.150616 ')).toBe('aarav.patil.150616');
    expect(LOGIN_ID_PATTERN.test('aarav.patil.150616.2')).toBe(true);
  });

  test('an account from before the choice existed reads as its own email', () => {
    expect(emailTypeOf({})).toBe('self');
    expect(emailTypeOf({ emailType: 'guardian' })).toBe('guardian');
  });
});

describe('accountIdentifier', () => {
  test('takes a Player ID, lower-cased into `identifier`', async () => {
    const { errors, body } = await runChains([accountIdentifier()], { identifier: 'Aarav.Patil.150616' });
    expect(errors).toEqual([]);
    expect(body.identifier).toBe('aarav.patil.150616');
  });

  test('falls back to the old `email` field', async () => {
    const { errors, body } = await runChains([accountIdentifier()], { email: 'Coach@Example.com' });
    expect(errors).toEqual([]);
    expect(body.identifier).toBe('coach@example.com');
  });

  test('refuses something that is neither', async () => {
    const { errors } = await runChains([accountIdentifier()], { identifier: 'not an id!' });
    expect(errors.join()).toMatch(/Player ID/);
    expect((await runChains([accountIdentifier()], {})).errors.join()).toMatch(/required/);
  });
});

describe('player registration rules', () => {
  const base = {
    firstName: 'Aarav',
    lastName: 'Patil',
    dateOfBirth: '2016-06-15',
    gender: 'Male',
    password: 'CorrectHorse1',
  };
  const guardian = { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' };

  test('own email: email and phone required, as before', async () => {
    const { errors } = await runChains(createPlayer(), { ...base, guardianConsent: true });
    expect(errors.join()).toMatch(/email: Email is required/);
    expect(errors.join()).toMatch(/phone: Phone number is required/);
  });

  test("guardian's email: guardian details required, player phone optional", async () => {
    const missing = await runChains(createPlayer(), {
      ...base, emailType: 'guardian', email: 'parent@example.com', guardianConsent: true,
    });
    expect(missing.errors.join()).toMatch(/guardian.name/);
    expect(missing.errors.join()).toMatch(/guardian.phone/);
    expect(missing.errors.join()).not.toMatch(/phone: Phone number is required/);

    const ok = await runChains(createPlayer(), {
      ...base, emailType: 'guardian', email: 'parent@example.com', guardian, guardianConsent: true,
    });
    expect(ok.errors).toEqual([]);
  });

  test('no email: no email field needed, guardian details are', async () => {
    const ok = await runChains(createPlayer(), { ...base, emailType: 'none', guardian, guardianConsent: true });
    expect(ok.errors).toEqual([]);
  });

  test('a player under 18 needs guardian consent', async () => {
    const { errors } = await runChains(createPlayer(), { ...base, emailType: 'none', guardian });
    expect(errors.join()).toMatch(/consent/);
  });

  test('an adult does not', async () => {
    const { errors } = await runChains(createPlayer(), {
      ...base, dateOfBirth: '1995-01-01', email: 'adult@example.com', phone: '9876543210',
    });
    expect(errors).toEqual([]);
  });

  test('an unknown emailType is refused', async () => {
    const { errors } = await runChains(createPlayer(), { ...base, emailType: 'parent', guardian, guardianConsent: true });
    expect(errors.join()).toMatch(/emailType/);
  });
});
