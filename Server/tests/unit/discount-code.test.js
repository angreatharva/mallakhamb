/**
 * The registration discount code.
 *
 * One shared code, 100% off, which makes this the only path in the app that
 * submits a team without money changing hands. Everything worth pinning here is
 * a way of getting that for free WITHOUT knowing the code:
 *
 *   - the feature switch being off
 *   - an unset `DISCOUNT_CODE` matching an empty submission
 *   - a blank, null or undefined code being treated as a match
 *   - a near-miss (case, whitespace) being accepted
 *
 * The last group covers the redemption path itself, which cannot lean on
 * Razorpay for any of its guards because it never reaches Razorpay.
 */

const {
  DISCOUNT_PERCENT,
  isDiscountCodeValid,
  applyDiscountCode,
  assertDiscountCodeValid,
} = require('../../src/config/payment.config');
const CoachService = require('../../src/services/user/coach.service');
const { ValidationError, NotFoundError } = require('../../src/errors');

const CODE = 'BRMC@2026';
const ON = { enabled: true, code: CODE };
const OFF = { enabled: false, code: CODE };

const COACH_ID = '6a8a9286fe57edf060353b19';
const COMPETITION_ID = '6a8a9286fe57edf060353b1a';
const TEAM_ID = '6a8a9286fe57edf060353b1b';

describe('isDiscountCodeValid', () => {
  it('accepts the configured code when the feature is on', () => {
    expect(isDiscountCodeValid(CODE, ON)).toBe(true);
  });

  it('refuses the right code when the feature is off', () => {
    expect(isDiscountCodeValid(CODE, OFF)).toBe(false);
  });

  it('refuses an empty submission against an UNSET code', () => {
    // The whole reason config-manager will not boot in this state: with both
    // sides empty a plain equality check matches, and every coach enters free.
    expect(isDiscountCodeValid('', { enabled: true, code: '' })).toBe(false);
    expect(isDiscountCodeValid(undefined, { enabled: true, code: '' })).toBe(false);
    expect(isDiscountCodeValid(null, { enabled: true, code: undefined })).toBe(false);
  });

  it('refuses blank and missing submissions against a real code', () => {
    for (const submitted of ['', null, undefined]) {
      expect(isDiscountCodeValid(submitted, ON)).toBe(false);
    }
  });

  it('refuses near misses', () => {
    for (const submitted of ['brmc@2026', 'BRMC@2027', ' BRMC@2026', 'BRMC@2026 ', 'BRMC', `${CODE}x`]) {
      expect(isDiscountCodeValid(submitted, ON)).toBe(false);
    }
  });

  it('refuses a missing configuration outright', () => {
    expect(isDiscountCodeValid(CODE, null)).toBe(false);
    expect(isDiscountCodeValid(CODE, undefined)).toBe(false);
    expect(isDiscountCodeValid(CODE, {})).toBe(false);
  });

  it('does not treat a truthy non-true `enabled` as on', () => {
    // `getBoolean` returns a real boolean, but a hand-built config object from
    // a test or a script might not — and 'false' is truthy.
    expect(isDiscountCodeValid(CODE, { enabled: 'false', code: CODE })).toBe(false);
    expect(isDiscountCodeValid(CODE, { enabled: 1, code: CODE })).toBe(false);
  });
});

describe('applyDiscountCode', () => {
  it('takes the whole fee off for a valid code', () => {
    const result = applyDiscountCode(1500, CODE, ON);

    expect(result).toEqual({
      applied: true,
      percent: DISCOUNT_PERCENT,
      originalAmount: 1500,
      discountAmount: 1500,
      payableAmount: 0,
    });
  });

  it('leaves the fee alone for an invalid code', () => {
    const result = applyDiscountCode(1500, 'nope', ON);

    expect(result.applied).toBe(false);
    expect(result.payableAmount).toBe(1500);
    expect(result.discountAmount).toBe(0);
  });

  it('leaves the fee alone when the feature is off, right code or not', () => {
    expect(applyDiscountCode(1500, CODE, OFF).payableAmount).toBe(1500);
  });

  it('survives a non-numeric amount without inventing money', () => {
    expect(applyDiscountCode(undefined, CODE, ON).payableAmount).toBe(0);
    expect(applyDiscountCode('nonsense', 'nope', ON).payableAmount).toBe(0);
  });
});

describe('assertDiscountCodeValid', () => {
  it('says codes are not being taken when the feature is off', () => {
    expect(() => assertDiscountCodeValid(CODE, OFF)).toThrow(/not being accepted/);
    expect(() => assertDiscountCodeValid(CODE, OFF)).toThrow(ValidationError);
  });

  it('gives the same answer for a wrong code and a blank one', () => {
    // Narrowing the message would narrow a guess.
    const wrong = (() => { try { assertDiscountCodeValid('nope', ON); } catch (e) { return e.message; } })();
    const blank = (() => { try { assertDiscountCodeValid('', ON); } catch (e) { return e.message; } })();

    expect(wrong).toBe(blank);
    expect(wrong).toMatch(/not valid/);
  });

  it('passes a valid code through', () => {
    expect(() => assertDiscountCodeValid(CODE, ON)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

/**
 * A coach service wired with just enough to reach the discount guards.
 *
 * @param {Object} [options]
 * @param {Object} [options.discount] - what `config.get('payments.discount')` returns
 * @param {boolean} [options.isSubmitted]
 * @param {Object} [options.competitionOverrides]
 */
function buildService({ discount = ON, isSubmitted = false, competitionOverrides = {} } = {}) {
  const updates = [];
  const transactions = [];

  const competition = {
    _id: COMPETITION_ID,
    playerFee: 500,
    apparatusFees: {},
    // Open, regular phase, well clear of both edges.
    registrationOpenDate: new Date('2020-01-01T00:00:00.000Z'),
    feeDueDate: new Date('2099-01-01T00:00:00.000Z'),
    endDate: new Date('2099-06-01T00:00:00.000Z'),
    lateFee: 200,
    registeredTeams: [{
      team: TEAM_ID,
      coach: COACH_ID,
      players: [{ apparatus: {} }, { apparatus: {} }, { apparatus: {} }],
      isSubmitted,
    }],
    ...competitionOverrides,
  };

  const service = new CoachService(
    { findById: async () => ({ _id: COACH_ID }) },        // coachRepository
    { findById: async () => ({ _id: TEAM_ID, name: 'SGAM-A' }) }, // teamRepository
    { info: () => {}, warn: () => {}, error: () => {} },  // logger
    null,                                                 // cacheService
    null,                                                 // authenticationService
    {                                                     // competitionRepository
      findById: async () => competition,
      // Team-addressed, not positional — see
      // CompetitionRepository.updateRegistrationFields.
      updateRegistrationFields: async (id, teamId, fields) => {
        updates.push({ teamId, fields });
        return true;
      },
    },
    null,                                                 // playerRepository
    { get: (path) => (path === 'payments.discount' ? discount : undefined) },
    { create: async (docs) => { transactions.push(...docs); return docs; } }
  );

  return { service, updates, transactions, competition };
}

describe('quoting an entry with a discount code', () => {
  it('prices three athletes at zero', async () => {
    const { service } = buildService();

    const quote = await service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE);

    expect(quote.applied).toBe(true);
    expect(quote.originalAmount).toBe(1500);
    expect(quote.payableAmount).toBe(0);
    expect(quote.playerCount).toBe(3);
  });

  it('writes nothing', async () => {
    const { service, updates, transactions } = buildService();

    await service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE);

    expect(updates).toEqual([]);
    expect(transactions).toEqual([]);
  });

  it('refuses a wrong code', async () => {
    const { service } = buildService();

    await expect(service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, 'nope'))
      .rejects.toThrow(/not valid/);
  });

  it('refuses when the feature is off', async () => {
    const { service } = buildService({ discount: OFF });

    await expect(service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/not being accepted/);
  });

  it('refuses an entry that is already submitted', async () => {
    const { service } = buildService({ isSubmitted: true });

    await expect(service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/already been submitted/);
  });

  it('refuses once registration has closed, code or no code', async () => {
    const { service } = buildService({
      competitionOverrides: {
        registrationOpenDate: new Date('2020-01-01T00:00:00.000Z'),
        feeDueDate: new Date('2020-02-01T00:00:00.000Z'),
        endDate: new Date('2020-03-01T00:00:00.000Z'),
      },
    });

    // A free entry is still an entry — accepting one after the meet closed is
    // exactly as wrong as accepting a paid one.
    await expect(service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/closed/);
  });

  it('refuses before registration opens', async () => {
    const { service } = buildService({
      competitionOverrides: { registrationOpenDate: new Date('2099-01-01T00:00:00.000Z') },
    });

    await expect(service.quoteTeamPaymentWithDiscount(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/not accepted yet/);
  });
});

describe('redeeming a discount code', () => {
  it('submits the team and records a zero-value transaction', async () => {
    const { service, updates, transactions } = buildService();

    const result = await service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE);

    expect(result.submitted).toBe(true);
    expect(result.amountPaid).toBe(0);
    expect(result.originalAmount).toBe(1500);

    // Addressed by TEAM. The write used to be built from the registration's
    // position in the array, which shifts when another coach withdraws.
    expect(updates[0].teamId).toBe(TEAM_ID);
    const fields = updates[0].fields;
    expect(fields.isSubmitted).toBe(true);
    // 'completed' because the obligation IS settled — at zero. Leaving it
    // 'pending' would list a team that owes nothing as still owing.
    expect(fields.paymentStatus).toBe('completed');
    expect(fields.paymentAmount).toBe(0);
    // No gateway was involved and the enum only knows 'razorpay'.
    expect(fields.paymentGateway).toBeUndefined();

    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(0);
    expect(transactions[0].paymentStatus).toBe('completed');
    expect(transactions[0].metadata.discountApplied).toBe(true);
    expect(transactions[0].metadata.discountAmount).toBe(1500);
  });

  it('never records the code itself', async () => {
    const { service, transactions } = buildService();

    await service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE);

    // A transaction list is read by more people than should be able to reuse a
    // free-entry code.
    expect(JSON.stringify(transactions)).not.toContain(CODE);
  });

  it('submits nothing for a wrong code', async () => {
    const { service, updates, transactions } = buildService();

    await expect(service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, 'nope'))
      .rejects.toThrow(/not valid/);
    expect(updates).toEqual([]);
    expect(transactions).toEqual([]);
  });

  it('submits nothing when the feature is off', async () => {
    const { service, updates } = buildService({ discount: OFF });

    await expect(service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/not being accepted/);
    expect(updates).toEqual([]);
  });

  it('submits nothing once registration has closed', async () => {
    const { service, updates } = buildService({
      competitionOverrides: {
        feeDueDate: new Date('2020-02-01T00:00:00.000Z'),
        endDate: new Date('2020-03-01T00:00:00.000Z'),
      },
    });

    await expect(service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(/closed/);
    expect(updates).toEqual([]);
  });

  it('is idempotent — a second redemption changes nothing', async () => {
    const { service, updates } = buildService({ isSubmitted: true });

    const result = await service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE);

    expect(result.alreadySubmitted).toBe(true);
    expect(updates).toEqual([]);
  });

  it('reports a missing registration rather than submitting', async () => {
    const { service } = buildService({ competitionOverrides: { registeredTeams: [] } });

    await expect(service.redeemDiscountAndSubmit(COACH_ID, COMPETITION_ID, CODE))
      .rejects.toThrow(NotFoundError);
  });
});

describe('the discount switch as the client sees it', () => {
  it('reports the feature state and never the code', () => {
    const { service } = buildService();

    const availability = service.getDiscountAvailability();

    expect(availability).toEqual({ enabled: true, percentOff: DISCOUNT_PERCENT });
    expect(JSON.stringify(availability)).not.toContain(CODE);
  });

  it('reports disabled when the switch is off', () => {
    const { service } = buildService({ discount: OFF });

    expect(service.getDiscountAvailability().enabled).toBe(false);
  });
});
