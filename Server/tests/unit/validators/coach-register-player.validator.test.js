/**
 * POST /api/coaches/players — the self-registration rules for "No email at
 * all", applied to what a coach sends.
 */

const { validationResult } = require('express-validator');
const { coachRegisterPlayer } = require('../../../src/validators/player.validator');

async function check(body) {
  const req = { body: { ...body } };
  for (const chain of coachRegisterPlayer()) {
    await chain.run(req);
  }
  return { errors: validationResult(req).array().map((e) => e.path), body: req.body };
}

const tenYearsAgo = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 10);
  return d.toISOString().slice(0, 10);
};

const VALID = {
  firstName: 'Aarav', lastName: 'Patil', dateOfBirth: tenYearsAgo(), gender: 'Male',
  guardian: { name: 'Sunita Patil', relation: 'Mother', phone: '9876543210' },
  guardianConsent: true,
};

describe('coachRegisterPlayer validator', () => {
  test('accepts a complete body and forces emailType to none', async () => {
    const { errors, body } = await check({ ...VALID, emailType: 'self' });
    expect(errors).toEqual([]);
    expect(body.emailType).toBe('none');
  });

  test('requires the guardian name, relation and phone', async () => {
    const { errors } = await check({ ...VALID, guardian: {} });
    expect(errors).toEqual(expect.arrayContaining(['guardian.name', 'guardian.relation', 'guardian.phone']));
  });

  test('requires the coach to confirm guardian consent under 18', async () => {
    const { errors } = await check({ ...VALID, guardianConsent: false });
    expect(errors).toContain('guardianConsent');
  });

  test('needs no email and no password from the coach', async () => {
    const { errors } = await check(VALID);
    expect(errors).not.toContain('email');
    expect(errors).not.toContain('password');
  });
});
