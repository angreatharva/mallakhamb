'use strict';

/**
 * Fee engine vectors: the four fee phases around every UTC day boundary, the
 * per-athlete late fee, apparatus add-ons, and the discount code.
 *
 * Every call passes `at`. The Node functions default it to "now", which would
 * make a vector depend on the day it was generated.
 */

const { requireServer } = require('../../lib/server');

const fees = requireServer('config/payment.config');

const DAY = 24 * 60 * 60 * 1000;
const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
/** Offsets from a day boundary: on it, one millisecond either side, and well clear of it. */
const NEAR = [0, 1, -1, 999, -999, 1000, -1000, 60_000, -60_000, 12 * 60 * 60 * 1000, -12 * 60 * 60 * 1000];

const utcDay = (rng) => Date.UTC(2026, rng.int(0, 11), rng.int(1, 28));
const iso = (ms) => new Date(ms).toISOString();

/** A date in one of the forms a competition document or a request can hold. */
function dateForm(rng, ms) {
  const kind = rng.int(0, 9);
  if (kind <= 4) return new Date(ms);
  if (kind <= 6) return iso(ms);
  if (kind === 7) return iso(ms).slice(0, 10); // date only
  if (kind === 8) return new Date(ms + rng.int(0, DAY - 1)); // any time on that day
  return ms;
}

function competition(rng) {
  const open = utcDay(rng);
  const due = open + rng.int(0, 20) * DAY;
  const end = due + rng.int(0, 20) * DAY;
  const out = {
    registrationOpenDate: dateForm(rng, open),
    feeDueDate: dateForm(rng, due),
    endDate: dateForm(rng, end),
    lateFee: rng.pick([0, 50, 100, 250, 99.5, '100', -10, null, undefined, 'abc']),
    playerFee: rng.pick([0, 100, 200, 300, 350.5, '250']),
    apparatusFees: rng.pick([
      undefined,
      null,
      {},
      { 'Pole Mallakhamb': 50, 'Rope Mallakhamb': 75, 'Hanging Mallakhamb': 100 },
      { 'Pole Mallakhamb': '50', 'Rope Mallakhamb': null },
      { 'Rope Mallakhamb': 'abc', 'Hanging Mallakhamb': 0 },
    ]),
  };
  const twist = rng.int(0, 19);
  if (twist === 0) delete out.registrationOpenDate;
  if (twist === 1) delete out.feeDueDate;
  if (twist === 2) delete out.endDate;
  if (twist === 3) out.feeDueDate = rng.pick(['', null, 'not a date']);
  if (twist === 4) out.playerFee = rng.pick([null, undefined, '', 'abc', -1]);
  return { out, boundaries: { open, dueEnd: due + DAY - 1, endEnd: end + DAY - 1 } };
}

/** A moment close to one of the competition's three boundaries, or anywhere in the year. */
function moment(rng, boundaries) {
  const kind = rng.int(0, 9);
  const ms = kind === 9 ? utcDay(rng) + rng.int(0, DAY - 1) : rng.pick(Object.values(boundaries)) + rng.pick(NEAR);
  return rng.chance(0.8) ? new Date(ms) : iso(ms);
}

function player(rng) {
  const some = () => rng.sample(APPARATUS, rng.int(0, 3));
  return {
    name: 'Athlete',
    apparatus: rng.pick([
      some(),
      some(),
      rng.pick(APPARATUS),
      [APPARATUS[0], APPARATUS[0], ' Rope Mallakhamb '], // a repeat and stray spaces
      { competition_1: some(), competition_3: some() },
      { competition_1: rng.pick(APPARATUS) },
      '',
      [],
      null,
      undefined,
      ['', 7, null],
    ]),
  };
}

const windowCall = (rng) => {
  const { out, boundaries } = competition(rng);
  return [out, moment(rng, boundaries)];
};

const INVALID_FEES = [null, undefined, '', 'abc', -1, Number.NaN, Infinity];
const SIMPLE = { registrationOpenDate: '2026-12-01', feeDueDate: '2026-12-05', endDate: '2026-12-13', lateFee: 100, playerFee: 300, apparatusFees: { 'Rope Mallakhamb': 50 } };
const DISCOUNT = { enabled: true, code: 'MEET100' };

module.exports = {
  engine: 'fees',
  functions: [
    {
      name: 'resolveFeeWindow',
      fn: fees.resolveFeeWindow,
      fixed: [
        [SIMPLE, new Date('2026-11-30T23:59:59.999Z')],
        [SIMPLE, new Date('2026-12-01T00:00:00.000Z')],
        [SIMPLE, new Date('2026-12-05T23:59:59.999Z')],
        [SIMPLE, new Date('2026-12-06T00:00:00.000Z')],
        [SIMPLE, new Date('2026-12-13T23:59:59.999Z')],
        [SIMPLE, new Date('2026-12-14T00:00:00.000Z')],
        [{}, new Date('2026-12-06T00:00:00.000Z')],
        [null, new Date('2026-12-06T00:00:00.000Z')],
        [undefined, '2026-12-06T00:00:00.000Z'],
      ],
      gen: windowCall,
    },
    { name: 'getLateFeePerPlayer', fn: fees.getLateFeePerPlayer, fixed: [[SIMPLE, new Date('2026-12-06T00:00:00.000Z')]], gen: windowCall },
    {
      name: 'assertPaymentWindowOpen',
      fn: fees.assertPaymentWindowOpen,
      fixed: [
        [SIMPLE, new Date('2026-11-30T23:59:59.999Z')],
        [SIMPLE, new Date('2026-12-14T00:00:00.000Z')],
        [SIMPLE, new Date('2026-12-03T10:00:00.000Z')],
      ],
      gen: windowCall,
    },
    {
      name: 'calculatePlayerFee',
      fn: fees.calculatePlayerFee,
      fixed: [
        [{ apparatus: ['Rope Mallakhamb'] }, SIMPLE],
        [{ apparatus: [] }, SIMPLE],
        [null, SIMPLE],
        ...INVALID_FEES.map((playerFee) => [{ apparatus: ['Rope Mallakhamb'] }, { ...SIMPLE, playerFee }]),
      ],
      gen: (rng) => [player(rng), competition(rng).out],
    },
    {
      name: 'calculatePlayerAdditionAmount',
      fn: fees.calculatePlayerAdditionAmount,
      fixed: [[{ apparatus: ['Rope Mallakhamb'] }, SIMPLE, new Date('2026-12-06T00:00:00.000Z')]],
      gen: (rng) => {
        const { out, boundaries } = competition(rng);
        return [player(rng), out, moment(rng, boundaries)];
      },
    },
    {
      name: 'calculateTeamPaymentAmount',
      fn: fees.calculateTeamPaymentAmount,
      fixed: [
        [[], SIMPLE, new Date('2026-12-03T00:00:00.000Z')],
        [null, SIMPLE, new Date('2026-12-03T00:00:00.000Z')],
        ['text', SIMPLE, new Date('2026-12-03T00:00:00.000Z')],
        [[{ apparatus: ['Rope Mallakhamb'] }, { apparatus: [] }], SIMPLE, new Date('2026-12-06T00:00:00.000Z')],
        [[{ apparatus: [] }], { ...SIMPLE, playerFee: null }, new Date('2026-12-03T00:00:00.000Z')],
      ],
      gen: (rng) => {
        const { out, boundaries } = competition(rng);
        return [Array.from({ length: rng.int(0, 8) }, () => player(rng)), out, moment(rng, boundaries)];
      },
    },
    {
      name: 'isDiscountCodeValid',
      fn: fees.isDiscountCodeValid,
      fixed: [
        ['MEET100', DISCOUNT],
        ['meet100', DISCOUNT],
        ['MEET100 ', DISCOUNT],
        ['', DISCOUNT],
        [null, DISCOUNT],
        ['MEET100', { enabled: false, code: 'MEET100' }],
        ['MEET100', { enabled: 'true', code: 'MEET100' }],
        ['MEET100', { enabled: true, code: '' }],
        ['MEET100', null],
        [100, { enabled: true, code: 100 }],
      ],
    },
    {
      name: 'applyDiscountCode',
      fn: fees.applyDiscountCode,
      fixed: [
        [1500, 'MEET100', DISCOUNT],
        [1500, 'WRONG', DISCOUNT],
        [0, 'MEET100', DISCOUNT],
        ['1500', 'MEET100', DISCOUNT],
        ['abc', 'MEET100', DISCOUNT],
        [null, 'WRONG', DISCOUNT],
        [1499.5, 'MEET100', DISCOUNT],
      ],
      gen: (rng) => [rng.pick([rng.int(0, 20000), rng.grid(0, 5000, 0.5, 1)]), rng.pick(['MEET100', 'WRONG', '', null]), rng.pick([DISCOUNT, DISCOUNT, { enabled: false, code: 'MEET100' }, null])],
    },
    {
      name: 'assertDiscountCodeValid',
      fn: fees.assertDiscountCodeValid,
      fixed: [
        ['MEET100', DISCOUNT],
        ['WRONG', DISCOUNT],
        ['MEET100', { enabled: false, code: 'MEET100' }],
        ['MEET100', null],
      ],
    },
    { name: 'getPaymentConfig', fn: fees.getPaymentConfig, fixed: [[]] },
  ],
};
