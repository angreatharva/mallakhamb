/**
 * The two stacks must agree on what a late payment costs.
 *
 * `Web/src/utils/scoring/competitionFee.js` mirrors
 * `Server/src/config/payment.config.js`, for the same reason the COP tables are
 * mirrored (see copRulesSync.test.js): the coach has to be quoted a total
 * BEFORE any request is made, and the server is the one that charges it.
 *
 * Drift here is not cosmetic. The client would show one number, Razorpay would
 * be handed the server's, and the verify step would reject the payment for an
 * amount mismatch — after the coach's money has already moved. So this feeds
 * the real server module the same inputs as the client mirror and requires the
 * answers to be identical, boundary for boundary.
 */

import { describe, it, expect } from 'vitest';

import {
  FEE_PHASE,
  resolveFeeWindow,
  calculateTeamPaymentAmount,
  calculatePlayerFee,
} from './competitionFee';

// Reaching across into the server package is deliberate. This is a monorepo and
// the invariant being protected is precisely that these two files agree.
import serverPayment from '../../../../Server/src/config/payment.config.js';

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

const COMPETITION = {
  playerFee: 500,
  apparatusFees: { 'Pole Mallakhamb': 100, 'Rope Mallakhamb': 50 },
  registrationOpenDate: day('2026-01-01'),
  feeDueDate: day('2026-12-05'),
  endDate: day('2026-12-13'),
  lateFee: 200,
};

const PLAYERS = [
  { apparatus: { competition_1: ['Pole Mallakhamb'] } },
  { apparatus: { competition_1: ['Rope Mallakhamb'], competition_2: ['Rope Mallakhamb'] } },
  { apparatus: {} },
];

/**
 * Every instant that decides something: both sides of each boundary, plus the
 * boundaries themselves to the millisecond.
 */
const INSTANTS = [
  '2025-06-01T00:00:00.000Z', // long before the window opens
  '2025-12-31T23:59:59.999Z', // last instant before opening
  '2026-01-01T00:00:00.000Z', // opening
  '2026-06-01T12:00:00.000Z', // comfortably inside
  '2026-12-05T23:59:59.999Z', // last instant of the base fee
  '2026-12-06T00:00:00.000Z', // first instant of the late fee
  '2026-12-13T23:59:59.999Z', // last instant payment is accepted
  '2026-12-14T00:00:00.000Z', // closed
].map((iso) => new Date(iso));

describe('the two stacks agree on the fee window', () => {
  it.each(INSTANTS)('resolves the same phase at %s', (at) => {
    const client = resolveFeeWindow(COMPETITION, at);
    const server = serverPayment.resolveFeeWindow(COMPETITION, at);

    expect(client.phase).toBe(server.phase);
    expect(client.canPay).toBe(server.canPay);
    expect(client.isLate).toBe(server.isLate);
    expect(client.lateFeePerPlayer).toBe(server.lateFeePerPlayer);
  });

  it.each(INSTANTS)('computes the same team total at %s', (at) => {
    expect(calculateTeamPaymentAmount(PLAYERS, COMPETITION, at))
      .toBe(serverPayment.calculateTeamPaymentAmount(PLAYERS, COMPETITION, at));
  });

  it('uses the same phase names', () => {
    expect(FEE_PHASE).toEqual(serverPayment.FEE_PHASE);
  });

  it('reports the same boundary instants', () => {
    const client = resolveFeeWindow(COMPETITION, new Date('2026-06-01T00:00:00.000Z'));
    const server = serverPayment.resolveFeeWindow(COMPETITION, new Date('2026-06-01T00:00:00.000Z'));

    expect(client.opensAt.toISOString()).toBe(server.opensAt.toISOString());
    expect(client.dueBy.toISOString()).toBe(server.dueBy.toISOString());
    expect(client.closesAt.toISOString()).toBe(server.closesAt.toISOString());
  });

  it('agrees on a competition that predates the fee window', () => {
    const legacy = { playerFee: 500, apparatusFees: {} };
    const at = new Date('2099-01-01T00:00:00.000Z');

    expect(resolveFeeWindow(legacy, at).phase)
      .toBe(serverPayment.resolveFeeWindow(legacy, at).phase);
    expect(calculateTeamPaymentAmount(PLAYERS, legacy, at))
      .toBe(serverPayment.calculateTeamPaymentAmount(PLAYERS, legacy, at));
  });
});

describe('the late fee sits on top of the per-athlete fee, not beside it', () => {
  const late = new Date('2026-12-06T00:00:00.000Z');
  const regular = new Date('2026-06-01T00:00:00.000Z');

  it('leaves the per-athlete base breakdown alone', () => {
    // `calculatePlayerFee` is what the payment page prints per row, and it must
    // keep meaning base + apparatus so the late fee can be shown as its own
    // line rather than smeared invisibly across every athlete.
    expect(calculatePlayerFee(PLAYERS[0], COMPETITION)).toBe(600);
    expect(calculatePlayerFee(PLAYERS[2], COMPETITION)).toBe(500);
  });

  it('charges one penalty per athlete', () => {
    const before = calculateTeamPaymentAmount(PLAYERS, COMPETITION, regular);
    const after = calculateTeamPaymentAmount(PLAYERS, COMPETITION, late);

    expect(after - before).toBe(COMPETITION.lateFee * PLAYERS.length);
  });
});
