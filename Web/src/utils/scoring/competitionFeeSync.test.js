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
  paidButRemoved,
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

describe('a reopened team pays only for players not paid yet (owner, 2026-11-17)', () => {
  const squad = [
    { player: 'p1', apparatus: { competition_1: ['Pole Mallakhamb'] } },
    { player: { _id: 'p2' }, apparatus: { competition_1: ['Rope Mallakhamb'] } },
    { player: 'p3', apparatus: {} },
  ];
  const paid = [{ player: 'p1', amount: 600 }, { player: 'p2', amount: 550 }];

  it.each([
    ['on time', day('2026-11-01')],
    ['late', day('2026-12-08')],
  ])('%s: both stacks charge the new player only', (_label, at) => {
    const client = calculateTeamPaymentAmount(squad, COMPETITION, at, paid);
    const server = serverPayment.calculateTeamPaymentAmount(squad, COMPETITION, at, paid);
    expect(client).toBe(server);
    expect(client).toBe(calculatePlayerFee(squad[2], COMPETITION) + (at > day('2026-12-05') ? 200 : 0));
  });

  it('nothing new: nothing to pay', () => {
    const all = [...paid, { player: 'p3', amount: 500 }];
    expect(calculateTeamPaymentAmount(squad, COMPETITION, day('2026-11-01'), all)).toBe(0);
    expect(serverPayment.calculateTeamPaymentAmount(squad, COMPETITION, day('2026-11-01'), all)).toBe(0);
  });

  it('no paidEntries: everyone pays, as before', () => {
    expect(calculateTeamPaymentAmount(squad, COMPETITION, day('2026-11-01')))
      .toBe(serverPayment.calculateTeamPaymentAmount(squad, COMPETITION, day('2026-11-01')));
  });
});

describe('owner scenario 2026-11-18: 4 paid, reopen +1, reopen -2', () => {
  // ₹100 a player, no apparatus add-ons, paid on time.
  const FLAT = { ...COMPETITION, playerFee: 100, apparatusFees: {} };
  const at = day('2026-11-01');
  const entry = (id) => ({ player: id, apparatus: {} });
  const both = (players, paid) => {
    const client = calculateTeamPaymentAmount(players, FLAT, at, paid);
    expect(serverPayment.calculateTeamPaymentAmount(players, FLAT, at, paid)).toBe(client);
    return client;
  };

  const four = ['p1', 'p2', 'p3', 'p4'].map(entry);
  const paidFour = four.map((e) => ({ player: e.player, amount: 100 }));
  const five = [...four, entry('p5')];
  const paidFive = [...paidFour, { player: 'p5', amount: 100 }];
  const three = five.filter((e) => !['p2', 'p4'].includes(e.player));

  it('1. a new team of 4 pays ₹400', () => {
    expect(both(four, [])).toBe(400);
  });

  it('2. reopened, one player added: pays ₹100 for the new player only', () => {
    expect(both(five, paidFour)).toBe(100);
  });

  it('3. reopened again, two removed: pays ₹0, and ₹200 is shown as non-refundable', () => {
    expect(both(three, paidFive)).toBe(0);
    expect(paidButRemoved(three, paidFive)).toEqual({ count: 2, amount: 200 });
  });

  it('a removed paid player added back is not charged again', () => {
    expect(both([...three, entry('p2')], paidFive)).toBe(0);
    expect(paidButRemoved([...three, entry('p2')], paidFive)).toEqual({ count: 1, amount: 100 });
  });

  it('nothing removed: no non-refundable row', () => {
    expect(paidButRemoved(five, paidFive)).toEqual({ count: 0, amount: 0 });
    expect(paidButRemoved(five, [])).toEqual({ count: 0, amount: 0 });
  });
});
