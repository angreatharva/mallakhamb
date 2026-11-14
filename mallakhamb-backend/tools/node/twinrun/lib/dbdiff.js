'use strict';

/**
 * Compares what a replay left in the database with what the recording left
 * (04 §2, point 6). It catches a write that answers correctly but stores a
 * different shape: a missing `__v` or `updatedAt`, a number stored as a
 * string, an array element in the wrong place, a document that was never
 * written.
 *
 * Documents are compared as canonical Extended JSON, so a type difference
 * (Int32 against Double, string against ObjectId) is a difference. Ids and
 * tokens go through the same mapping the responses built; timestamps only
 * have to be timestamps; the stored keys in `invariants.json` are random.
 */

const fs = require('node:fs');
const zlib = require('node:zlib');
const { mongodb } = require('./local');
const { withDatabase } = require('./snapshot');
const invariants = require('../invariants.json');

const idOf = (document) => (document._id && document._id.$oid) || JSON.stringify(document._id);

/** Canonical Extended JSON for every collection: `{ name: [documents sorted by _id] }`. */
async function readDatabase(database) {
  const { BSON } = mongodb();
  return withDatabase(database, async (db) => {
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name).filter((name) => !name.startsWith('system.')).sort();
    const out = {};
    for (const name of names) {
      const documents = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      out[name] = JSON.parse(BSON.EJSON.stringify(documents, { relaxed: false }));
    }
    return out;
  });
}

const saveState = (state, file) => fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(state)));
const loadState = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));

/** Compare two stored values; canonical EJSON wrappers (`$oid`, `$date`, `$numberInt`…) are part of the comparison. */
function compareStored(recorded, replayed, path, comparison, diffs) {
  const key = path[path.length - 1];
  if (typeof key === 'string' && invariants.storedKeys[key]) {
    const kind = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? Object.keys(value).filter((k) => k.startsWith('$')).join() || 'object' : typeof value);
    const rule = invariants.storedKeys[key];
    if (kind(recorded) !== kind(replayed)) diffs.push(`${path.join('.')}: stored as ${kind(recorded)} vs ${kind(replayed)}`);
    else if (recorded !== replayed && rule.pattern && typeof recorded === 'string' && !(new RegExp(rule.pattern).test(recorded) && new RegExp(rule.pattern).test(replayed))) {
      diffs.push(`${path.join('.')}: does not look like ${rule.reason.split('.')[0].toLowerCase()}`);
    }
    return;
  }
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (isObject(recorded) && isObject(replayed)) {
    // A date: both sides must hold a date; the instant belongs to the run.
    if ('$date' in recorded || '$date' in replayed) {
      if (!('$date' in recorded && '$date' in replayed)) diffs.push(`${path.join('.')}: a date on one side only`);
      return;
    }
    for (const k of Object.keys(recorded)) {
      const other = comparison.rewrite(k);
      if (!(other in replayed)) diffs.push(`${[...path, k].join('.')}: not stored by the replay`);
      else compareStored(recorded[k], replayed[other], [...path, k], comparison, diffs);
    }
    const expected = new Set(Object.keys(recorded).map((k) => comparison.rewrite(k)));
    for (const k of Object.keys(replayed)) if (!expected.has(k)) diffs.push(`${[...path, k].join('.')}: stored only by the replay`);
    return;
  }
  if (Array.isArray(recorded) && Array.isArray(replayed)) {
    if (recorded.length !== replayed.length) diffs.push(`${path.join('.')}: ${recorded.length} items stored vs ${replayed.length}`);
    else recorded.forEach((item, i) => compareStored(item, replayed[i], [...path, i], comparison, diffs));
    return;
  }
  // Leaves: let the response comparator decide (ids and tokens map, timestamps normalise).
  comparison.value(recorded, replayed, path, diffs);
}

/**
 * @param {Object} recorded - state after the recording
 * @param {Object} replayed - state after the replay
 * @param {import('./compare').Comparison} comparison - carries the id mapping built from the responses
 * @returns {string[]} differences, at most a few per collection
 */
function compareStates(recorded, replayed, comparison) {
  const diffs = [];
  for (const name of [...new Set([...Object.keys(recorded), ...Object.keys(replayed)])].sort()) {
    const a = recorded[name] || [];
    const b = replayed[name] || [];
    if (a.length !== b.length) {
      diffs.push(`${name}: ${a.length} documents after the recording, ${b.length} after the replay`);
      continue;
    }
    const byId = new Map(b.map((document) => [idOf(document), document]));
    const unmatchedRecorded = [];
    const used = new Set();
    const pairs = [];
    for (const document of a) {
      const mapped = comparison.rewrite(idOf(document));
      if (byId.has(mapped)) {
        pairs.push([document, byId.get(mapped)]);
        used.add(mapped);
      } else unmatchedRecorded.push(document);
    }
    // Documents whose id never appeared in a response (tokens, audit entries): pair them in creation order.
    const unmatchedReplayed = b.filter((document) => !used.has(idOf(document)));
    unmatchedRecorded.forEach((document, i) => {
      comparison.pair(idOf(document), idOf(unmatchedReplayed[i]));
      pairs.push([document, unmatchedReplayed[i]]);
    });

    const before = diffs.length;
    for (const [x, y] of pairs) {
      const own = [];
      compareStored(x, y, [name, idOf(x)], comparison, own);
      diffs.push(...own.slice(0, 3));
      if (diffs.length - before >= 9) {
        diffs.push(`${name}: more differences not shown`);
        break;
      }
    }
  }
  return diffs;
}

module.exports = { readDatabase, saveState, loadState, compareStates };
