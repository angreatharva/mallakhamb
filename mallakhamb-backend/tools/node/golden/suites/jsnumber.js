'use strict';

/**
 * Number vectors for the Java `JsNumber` helper (04 §3): the JavaScript number
 * operations the engines rely on. Not an engine; these pin the primitives.
 */

/** Doubles that sit on, or a hair either side of, a rounding tie. */
function tricky(rng) {
  const kind = rng.int(0, 7);
  if (kind === 0) return rng.grid(0, 10, 0.005, 3);
  if (kind === 1) return rng.grid(0, 10, 0.05) + rng.grid(0, 10, 0.05); // a sum with float error
  if (kind === 2) return (rng.grid(0, 10, 0.05) + rng.grid(0, 10, 0.05)) / 2;
  if (kind === 3) return (rng.grid(0, 10, 0.05) + rng.grid(0, 10, 0.05) + rng.grid(0, 10, 0.05)) / 3;
  if (kind === 4) return rng.int(0, 2000) / 1000 + 0.0005;
  if (kind === 5) return -rng.grid(0, 10, 0.005, 3);
  if (kind === 6) return rng.int(0, 100) + 0.5;
  return (rng.next() - 0.5) * 200;
}

const EDGE = [0, -0, 0.5, -0.5, 1.5, 2.5, -1.5, -2.5, 0.49999999999999994, 1.005, 8.345, 8.355, 9.225, 1e21, 1e-7, 123.456, -0.0001, Number.NaN, Infinity, -Infinity];

module.exports = {
  engine: 'jsnumber',
  functions: [
    {
      name: 'toFixed',
      fn: (value, digits) => value.toFixed(digits),
      fixed: EDGE.flatMap((value) => [0, 1, 2, 3].map((digits) => [value, digits])),
      gen: (rng) => [tricky(rng), rng.pick([0, 1, 2, 2, 3, 3])],
    },
    {
      name: 'toFixedNumber',
      fn: (value, digits) => parseFloat(value.toFixed(digits)),
      fixed: EDGE.flatMap((value) => [2, 3].map((digits) => [value, digits])),
      gen: (rng) => [tricky(rng), rng.pick([2, 3])],
    },
    { name: 'round', fn: (value) => Math.round(value), fixed: EDGE.map((value) => [value]), gen: (rng) => [tricky(rng) * rng.pick([1, 100])] },
    {
      name: 'roundToHundredths',
      fn: (value) => Math.round(value * 100) / 100,
      fixed: EDGE.map((value) => [value]),
      gen: (rng) => [tricky(rng)],
    },
    { name: 'toString', fn: (value) => String(value), fixed: EDGE.map((value) => [value]), gen: (rng) => [tricky(rng)] },
    {
      name: 'toNumber',
      fn: (text) => Number(text),
      fixed: ['', ' ', '8.5', ' 8.5 ', '08', '1e2', '0x10', '.5', '5.', '-0', '+3', '1,5', 'abc', '8.5abc', 'Infinity', null, undefined, true, false, [], [7], {}].map((v) => [v]),
    },
    {
      name: 'parseFloat',
      fn: (text) => parseFloat(text),
      fixed: ['', ' ', '8.5', ' 8.5 ', '08', '1e2', '0x10', '.5', '5.', '-0', '+3', '1,5', 'abc', '8.5abc', 'Infinity', null, undefined].map((v) => [v]),
    },
  ],
};
