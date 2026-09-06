/**
 * The registration fee window and the late fee it gates.
 *
 * A competition may name three things: the day fees open, the last day the base
 * fee alone is accepted, and a per-athlete penalty for paying after that. The
 * rule the feature was asked for is precise — "paying after the last pay fees
 * date, up to 23:59 of the End Date, gets the penalty" — and everything that
 * matters here is a BOUNDARY, so the boundaries are what this pins.
 *
 * The three fields are optional, and the reason they are optional is that every
 * competition created before them must keep pricing exactly as it did. That is
 * the last group of assertions, and it is the one most likely to catch a
 * regression: it is easy to make a missing `feeDueDate` mean "the epoch" and
 * silently charge a late fee on every meet in the database.
 */

const {
  FEE_PHASE,
  resolveFeeWindow,
  getLateFeePerPlayer,
  assertPaymentWindowOpen,
  calculateTeamPaymentAmount,
  calculatePlayerAdditionAmount,
} = require('../../src/config/payment.config');
const { ValidationError } = require('../../src/errors');

/** Midnight UTC, the way an `<input type="date">` value is stored. */
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso) => new Date(iso);

/** A meet that opens in January, wants its money by 5 Dec, and runs 12–13 Dec. */
const COMPETITION = {
  playerFee: 500,
  apparatusFees: { 'Pole Mallakhamb': 100 },
  registrationOpenDate: day('2026-01-01'),
  feeDueDate: day('2026-12-05'),
  endDate: day('2026-12-13'),
  lateFee: 200,
};

/** Two athletes: one on Pole (500 + 100), one on nothing extra (500). */
const PLAYERS = [
  { apparatus: { competition_1: ['Pole Mallakhamb'] } },
  { apparatus: {} },
];

describe('resolveFeeWindow', () => {
  it('refuses payment before the opening day', () => {
    const window = resolveFeeWindow(COMPETITION, at('2025-12-31T23:59:59.999Z'));

    expect(window.phase).toBe(FEE_PHASE.NOT_OPEN);
    expect(window.canPay).toBe(false);
    expect(window.lateFeePerPlayer).toBe(0);
  });

  it('opens at the FIRST millisecond of the opening day, not the end of it', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-01-01T00:00:00.000Z'));

    expect(window.phase).toBe(FEE_PHASE.REGULAR);
    expect(window.canPay).toBe(true);
  });

  it('charges the base fee alone through 23:59:59.999 on the due day', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-12-05T23:59:59.999Z'));

    expect(window.phase).toBe(FEE_PHASE.REGULAR);
    expect(window.lateFeePerPlayer).toBe(0);
  });

  it('charges the late fee from the first millisecond after the due day', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-12-06T00:00:00.000Z'));

    expect(window.phase).toBe(FEE_PHASE.LATE);
    expect(window.isLate).toBe(true);
    expect(window.canPay).toBe(true);
    expect(window.lateFeePerPlayer).toBe(200);
  });

  it('still accepts a late payment at 23:59 on the end date', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-12-13T23:59:59.999Z'));

    expect(window.phase).toBe(FEE_PHASE.LATE);
    expect(window.canPay).toBe(true);
  });

  it('closes the moment the end date is over', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-12-14T00:00:00.000Z'));

    expect(window.phase).toBe(FEE_PHASE.CLOSED);
    expect(window.canPay).toBe(false);
    expect(window.lateFeePerPlayer).toBe(0);
  });

  it('reports the boundaries it used, so a screen can name the dates', () => {
    const window = resolveFeeWindow(COMPETITION, at('2026-06-01T00:00:00.000Z'));

    expect(window.opensAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(window.dueBy.toISOString()).toBe('2026-12-05T23:59:59.999Z');
    expect(window.closesAt.toISOString()).toBe('2026-12-13T23:59:59.999Z');
  });

  it('treats a zero or negative late fee as no late fee at all', () => {
    const free = { ...COMPETITION, lateFee: 0 };
    const nonsense = { ...COMPETITION, lateFee: -50 };
    const past = at('2026-12-10T00:00:00.000Z');

    expect(getLateFeePerPlayer(free, past)).toBe(0);
    expect(getLateFeePerPlayer(nonsense, past)).toBe(0);
    // Still LATE — the deadline did pass; there is simply nothing to charge.
    expect(resolveFeeWindow(free, past).phase).toBe(FEE_PHASE.LATE);
  });
});

describe('the amounts a coach and a super admin are quoted', () => {
  it('charges base plus apparatus, and nothing more, inside the window', () => {
    const total = calculateTeamPaymentAmount(PLAYERS, COMPETITION, at('2026-06-01T00:00:00.000Z'));

    expect(total).toBe(1100); // (500 + 100) + 500
  });

  it('adds the late fee PER ATHLETE, not once per team', () => {
    const total = calculateTeamPaymentAmount(PLAYERS, COMPETITION, at('2026-12-06T00:00:00.000Z'));

    // 1100 + (200 x 2). A flat penalty would read 1300 here, and would be
    // wrong by (playerCount - 1) x lateFee on every squad but a solo one.
    expect(total).toBe(1500);
  });

  it('charges a super admin the same penalty for adding one athlete late', () => {
    const regular = calculatePlayerAdditionAmount(PLAYERS[0], COMPETITION, at('2026-06-01T00:00:00.000Z'));
    const late = calculatePlayerAdditionAmount(PLAYERS[0], COMPETITION, at('2026-12-06T00:00:00.000Z'));

    expect(regular).toBe(600);
    expect(late).toBe(800);
  });

  it('charges nothing for an empty squad, late or not', () => {
    expect(calculateTeamPaymentAmount([], COMPETITION, at('2026-12-06T00:00:00.000Z'))).toBe(0);
  });
});

describe('assertPaymentWindowOpen', () => {
  it('says when registration opens, rather than just refusing', () => {
    expect(() => assertPaymentWindowOpen(COMPETITION, at('2025-06-01T00:00:00.000Z')))
      .toThrow(/opens on 2026-01-01/);
    expect(() => assertPaymentWindowOpen(COMPETITION, at('2025-06-01T00:00:00.000Z')))
      .toThrow(ValidationError);
  });

  it('says when registration closed', () => {
    expect(() => assertPaymentWindowOpen(COMPETITION, at('2027-01-01T00:00:00.000Z')))
      .toThrow(/closed at the end of 2026-12-13/);
  });

  it('lets a payment inside the window straight through, late or not', () => {
    expect(assertPaymentWindowOpen(COMPETITION, at('2026-06-01T00:00:00.000Z')).phase)
      .toBe(FEE_PHASE.REGULAR);
    // Late is not blocked — it is charged. Blocking it would make the late fee
    // unreachable, which is the one thing this feature exists to collect.
    expect(assertPaymentWindowOpen(COMPETITION, at('2026-12-10T00:00:00.000Z')).phase)
      .toBe(FEE_PHASE.LATE);
  });
});

describe('a competition created before this feature existed', () => {
  const LEGACY = { playerFee: 500, apparatusFees: { 'Pole Mallakhamb': 100 } };

  it('is permanently in the regular phase and always payable', () => {
    const window = resolveFeeWindow(LEGACY, at('2099-01-01T00:00:00.000Z'));

    expect(window.phase).toBe(FEE_PHASE.REGULAR);
    expect(window.canPay).toBe(true);
    expect(window.lateFeePerPlayer).toBe(0);
  });

  it('is priced exactly as it was before the late fee existed', () => {
    expect(calculateTeamPaymentAmount(PLAYERS, LEGACY, at('2099-01-01T00:00:00.000Z'))).toBe(1100);
  });

  it('never charges a late fee when only the deadline is missing', () => {
    const noDeadline = { ...COMPETITION, feeDueDate: undefined };

    expect(getLateFeePerPlayer(noDeadline, at('2026-12-10T00:00:00.000Z'))).toBe(0);
  });

  it('never closes when only the end date is missing', () => {
    const noEnd = { ...COMPETITION, endDate: undefined };

    expect(resolveFeeWindow(noEnd, at('2030-01-01T00:00:00.000Z')).canPay).toBe(true);
  });
});
