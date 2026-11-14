'use strict';

/**
 * JSON encoding for golden vectors.
 *
 * Plain JSON loses values the engines can take or return: `undefined`, `NaN`,
 * `-0`, `±Infinity` and `Date`. Those are written as a one-key object
 * `{"$": "<name>"}` or `{"$date": "<ISO>"}`. Everything else is plain JSON, so
 * a number is rendered the way JavaScript renders it (shortest string that
 * round-trips), which is what the Java side compares against (04 §3).
 *
 * Object keys keep their insertion order.
 */

const SPECIAL = { undefined: undefined, NaN: Number.NaN, '-0': -0, Infinity, '-Infinity': -Infinity };

function encode(value) {
  if (value === undefined) return { $: 'undefined' };
  if (value === null) return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $: 'NaN' };
    if (value === Infinity) return { $: 'Infinity' };
    if (value === -Infinity) return { $: '-Infinity' };
    if (Object.is(value, -0)) return { $: '-0' };
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return { $date: Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value instanceof Set) return { $set: [...value].map(encode) };
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = encode(value[key]);
    return out;
  }
  throw new Error(`golden codec: cannot encode a ${typeof value}`);
}

function decode(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$') return SPECIAL[value.$];
  if (keys.length === 1 && keys[0] === '$date') return new Date(value.$date);
  if (keys.length === 1 && keys[0] === '$set') return new Set(value.$set.map(decode));
  const out = {};
  for (const key of keys) out[key] = decode(value[key]);
  return out;
}

module.exports = { encode, decode };
