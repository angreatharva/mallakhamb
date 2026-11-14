'use strict';

/**
 * Compares a recorded response with a replayed one (04 §2).
 *
 * Two runs of the same requests can't be byte-identical: each run mints its
 * own ids, tokens and timestamps. Those, and only those, are normalised:
 *
 *   - a generated ObjectId      mapped by first appearance, one-to-one
 *   - a JWT                     decoded; its claims are compared instead
 *   - an opaque token           (CSRF, refresh) same shape; mapped
 *   - a timestamp               both sides must be timestamps
 *   - the keys in `invariants.json`: random or timing values, checked by shape
 *
 * Everything else must be equal. The mapping is also what lets the replayer
 * rewrite the next request: where the recording sent id A, the replay sends
 * the id its own run got in A's place.
 */

const invariants = require('../invariants.json');

const OBJECT_ID = /^[0-9a-f]{24}$/;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const HTTP_TIME = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
/** Claims that are a time or a per-token random value. */
const VOLATILE_CLAIMS = new Set(['iat', 'exp', 'nbf', 'jti', 'auth_time']);
/** Response headers whose value must match. `etag` depends on the body, so only its presence is compared. */
const COMPARED_HEADERS = ['content-type', 'cache-control', 'www-authenticate', 'content-disposition', 'location'];
const PRESENCE_HEADERS = ['etag', 'x-new-token', 'x-correlation-id'];

const shape = (text) => text.replace(/[a-z]/g, 'a').replace(/[A-Z]/g, 'A').replace(/\d/g, '0');

class Comparison {
  constructor() {
    /** recorded value → replayed value, for ids and tokens. */
    this.map = new Map();
    this.reverse = new Map();
  }

  /** Remember that the replay has `replayed` where the recording had `recorded`; false if that contradicts an earlier pairing. */
  pair(recorded, replayed) {
    if (recorded === replayed) return true;
    const known = this.map.get(recorded);
    if (known !== undefined) return known === replayed;
    if (this.reverse.has(replayed)) return false;
    this.map.set(recorded, replayed);
    this.reverse.set(replayed, recorded);
    return true;
  }

  /** The replay's counterpart of a recorded string, with every mapped id and token swapped in. */
  rewrite(text) {
    if (typeof text !== 'string' || this.map.size === 0) return text;
    let out = text.replace(/[0-9a-f]{24}/g, (id) => this.map.get(id) || id);
    for (const [recorded, replayed] of this.map) {
      if (recorded.length !== 24 && out.includes(recorded)) out = out.split(recorded).join(replayed);
    }
    return out;
  }

  decodeJwt(token) {
    try {
      return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  /** Compare two values at `path`; push a line to `diffs` for each real difference. */
  value(recorded, replayed, path, diffs) {
    const key = path[path.length - 1];
    if (typeof key === 'string' && invariants.keys[key]) {
      const rule = invariants.keys[key];
      if (typeof recorded !== typeof replayed) diffs.push(`${path.join('.')}: ${typeof recorded} vs ${typeof replayed}`);
      else if (rule.pair && typeof recorded === 'string') this.pair(recorded, replayed);
      return;
    }
    if (recorded === replayed) return;

    if (typeof recorded === 'string' && typeof replayed === 'string') {
      if (OBJECT_ID.test(recorded) && OBJECT_ID.test(replayed)) {
        if (!this.pair(recorded, replayed)) diffs.push(`${path.join('.')}: id ${recorded} was ${this.map.get(recorded) || 'unmapped'} before, now ${replayed}`);
        return;
      }
      if (JWT.test(recorded) && JWT.test(replayed)) {
        const a = this.decodeJwt(recorded);
        const b = this.decodeJwt(replayed);
        if (a && b) {
          for (const claim of VOLATILE_CLAIMS) {
            if ((claim in a) !== (claim in b)) diffs.push(`${path.join('.')}: token claim ${claim} present on one side only`);
            delete a[claim];
            delete b[claim];
          }
          this.value(a, b, [...path, '<claims>'], diffs);
        }
        this.pair(recorded, replayed);
        return;
      }
      if ((ISO_TIME.test(recorded) && ISO_TIME.test(replayed)) || (HTTP_TIME.test(recorded) && HTTP_TIME.test(replayed))) return;
      // A string that embeds a mapped id or token (a room id, a URL, a message) is equal once rewritten.
      if (this.rewrite(recorded) === replayed) return;
      diffs.push(`${path.join('.')}: ${JSON.stringify(recorded).slice(0, 90)} vs ${JSON.stringify(replayed).slice(0, 90)}`);
      return;
    }

    if (Array.isArray(recorded) && Array.isArray(replayed)) {
      if (recorded.length !== replayed.length) {
        diffs.push(`${path.join('.')}: ${recorded.length} items vs ${replayed.length}`);
        return;
      }
      recorded.forEach((item, i) => this.value(item, replayed[i], [...path, i], diffs));
      return;
    }

    if (recorded && replayed && typeof recorded === 'object' && typeof replayed === 'object' && !Array.isArray(recorded) && !Array.isArray(replayed)) {
      const recordedKeys = Object.keys(recorded);
      const replayedKeys = Object.keys(replayed);
      // An object keyed by generated ids: compare through the mapping.
      const translate = (k) => (OBJECT_ID.test(k) && this.map.has(k) ? this.map.get(k) : k);
      for (const k of recordedKeys) {
        const other = translate(k);
        if (!(other in replayed)) diffs.push(`${[...path, k].join('.')}: missing in the replay`);
        else this.value(recorded[k], replayed[other], [...path, k], diffs);
      }
      const expected = new Set(recordedKeys.map(translate));
      for (const k of replayedKeys) if (!expected.has(k)) diffs.push(`${[...path, k].join('.')}: only in the replay`);
      // Key order is part of the wire shape the frontend never depends on, but a reorder is worth knowing about.
      if (diffs.length === 0 && recordedKeys.map(translate).join('\u0000') !== replayedKeys.join('\u0000')) {
        diffs.push(`${path.join('.') || '<body>'}: same keys in a different order`);
      }
      return;
    }

    diffs.push(`${path.join('.')}: ${JSON.stringify(recorded)?.slice(0, 90)} vs ${JSON.stringify(replayed)?.slice(0, 90)}`);
  }

  /** `name=value; Attr; Attr=x` → { name, value, attributes } with times replaced by their kind. */
  parseCookie(raw) {
    const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
    const eq = pair.indexOf('=');
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      attributes: attributes.map((attribute) => (/^expires=/i.test(attribute) ? (/1970/.test(attribute) ? 'Expires=<past>' : 'Expires=<time>') : attribute)).sort(),
    };
  }

  cookies(recorded, replayed, diffs) {
    const a = recorded.map((raw) => this.parseCookie(raw));
    const b = replayed.map((raw) => this.parseCookie(raw));
    const names = (list) => list.map((cookie) => cookie.name).join(', ');
    if (names(a) !== names(b)) {
      diffs.push(`set-cookie: [${names(a)}] vs [${names(b)}]`);
      return;
    }
    a.forEach((cookie, i) => {
      const other = b[i];
      if (cookie.attributes.join('; ') !== other.attributes.join('; ')) {
        diffs.push(`set-cookie ${cookie.name}: attributes "${cookie.attributes.join('; ')}" vs "${other.attributes.join('; ')}"`);
      }
      if ((cookie.value === '') !== (other.value === '')) diffs.push(`set-cookie ${cookie.name}: one side clears it, the other sets it`);
      else if (cookie.value !== other.value) {
        if (shape(cookie.value).length !== shape(other.value).length && !JWT.test(cookie.value)) {
          diffs.push(`set-cookie ${cookie.name}: value length ${cookie.value.length} vs ${other.value.length}`);
        }
        if (JWT.test(cookie.value) && JWT.test(other.value)) this.value(cookie.value, other.value, ['set-cookie', cookie.name], diffs);
        else this.pair(cookie.value, other.value);
      }
    });
  }

  /** Same keys and same value types, whatever the values: for a response that measures the process answering it. */
  shape(recorded, replayed, path, diffs) {
    const kind = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
    if (kind(recorded) !== kind(replayed)) {
      diffs.push(`${path.join('.') || '<body>'}: ${kind(recorded)} vs ${kind(replayed)}`);
      return;
    }
    if (kind(recorded) !== 'object') return;
    for (const key of Object.keys(recorded)) {
      if (!(key in replayed)) diffs.push(`${[...path, key].join('.')}: missing in the replay`);
      else this.shape(recorded[key], replayed[key], [...path, key], diffs);
    }
    for (const key of Object.keys(replayed)) if (!(key in recorded)) diffs.push(`${[...path, key].join('.')}: only in the replay`);
  }

  /**
   * @param {string} operation - `METHOD /path/:id`, to look up an operation-level invariant
   * @param {{status: number, headers: Object, setCookie: string[], body: string}} recorded
   * @param {{status: number, headers: Object, setCookie: string[], body: string}} replayed
   * @returns {string[]} the differences; empty when the two responses agree
   */
  response(operation, recorded, replayed) {
    const diffs = [];
    // /api/v1 is an alias of /api: one rule covers both.
    const rule = invariants.operations[operation.replace(' /api/v1/', ' /api/')] || {};
    const statusAllowed = rule.statuses && rule.statuses.includes(recorded.status) && rule.statuses.includes(replayed.status);
    if (recorded.status !== replayed.status && !statusAllowed) diffs.push(`status: ${recorded.status} vs ${replayed.status}`);

    for (const header of COMPARED_HEADERS) {
      if (recorded.headers[header] !== replayed.headers[header]) {
        diffs.push(`header ${header}: ${JSON.stringify(recorded.headers[header])} vs ${JSON.stringify(replayed.headers[header])}`);
      }
    }
    for (const header of PRESENCE_HEADERS) {
      const a = recorded.headers[header];
      const b = replayed.headers[header];
      if ((a === undefined) !== (b === undefined)) diffs.push(`header ${header}: present on one side only`);
      else if (a !== undefined && header === 'x-new-token') this.value(a, b, ['header', header], diffs);
    }
    this.cookies(recorded.setCookie || [], replayed.setCookie || [], diffs);

    if (recorded.bodyBase64 !== undefined || replayed.bodyBase64 !== undefined) {
      const bytes = (side) => (side.bodyBase64 === undefined ? null : Buffer.from(side.bodyBase64, 'base64'));
      const a = bytes(recorded);
      const b = bytes(replayed);
      if (!a || !b) diffs.push('body: binary on one side only');
      else if (rule.body === 'pdf') {
        if (!(a.subarray(0, 5).toString() === '%PDF-' && b.subarray(0, 5).toString() === '%PDF-')) diffs.push('body: not a PDF on both sides');
      } else if (!a.equals(b)) diffs.push(`body: binary differs (${a.length} vs ${b.length} bytes)`);
      return diffs;
    }

    const parse = (text) => {
      try {
        return { json: JSON.parse(text) };
      } catch {
        return { text };
      }
    };
    const a = parse(recorded.body);
    const b = parse(replayed.body);
    if ('json' in a && 'json' in b && rule.align && recorded.status < 300 && replayed.status < 300) {
      // Random by design: the caller checks the rule for `data` and aligns the state (lib/align.js).
      // Everything around `data` (success, message, …) is still compared here.
      const around = ({ data, ...rest }) => rest;
      this.value(around(a.json), around(b.json), [], diffs);
      this.pending = { name: rule.align, recorded: a.json, replayed: b.json };
    } else if ('json' in a && 'json' in b && rule.body === 'shape') this.shape(a.json, b.json, [], diffs);
    else if ('json' in a && 'json' in b) this.value(a.json, b.json, [], diffs);
    else if ('json' in a !== 'json' in b) diffs.push('body: JSON on one side only');
    else if (this.rewrite(a.text) !== b.text) diffs.push(`body: text differs (${a.text.length} vs ${b.text.length} characters)`);
    return diffs;
  }
}

module.exports = { Comparison };
