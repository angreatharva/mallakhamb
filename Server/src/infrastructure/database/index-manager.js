/**
 * Index management: make the database match what the schemas declare.
 *
 * WHY THIS EXISTS
 *
 * Indexes had two sources of truth that disagreed with each other.
 *
 *   1. The Mongoose schemas — `schema.index(...)` and `unique: true` on a path.
 *      These are built automatically, but ONLY when `autoIndex` is on, and
 *      connection.js turns it on in development and off everywhere else. So the
 *      indexes a developer has are not the indexes production has.
 *
 *   2. The migrations (001, 002, 004, 005), which build indexes by hand for the
 *      environments where autoIndex is off — with their own names.
 *
 * Those two collide. Mongoose's autoIndex creates `email_1` from `unique: true`;
 * migration 005 then asks for the same key under the name
 * `judge_account_email_unique`, and MongoDB refuses: "Index already exists with
 * a different name". The runner rolls the whole batch back, so on a developer's
 * machine `npm run migrate:up` fails at 005 and 006 and 007 never run.
 *
 * This module makes the SCHEMAS the source of truth and reconciles the database
 * to them, tolerating whatever names happen to already be there.
 *
 * WHAT IT DOES NOT DO
 *
 * It never drops an index it did not expect. Migrations 001 and 002 created
 * indexes that no schema declares (`players.team`, `players.isActive`, and
 * others), and Mongoose's own `syncIndexes()` would delete exactly those —
 * silently removing indexes that live queries depend on. Undeclared indexes are
 * REPORTED as drift and left alone; removing one is a decision for a person.
 *
 * @module infrastructure/database/index-manager
 */

/** Options that make two index definitions genuinely different, not just named differently. */
const SIGNIFICANT_OPTIONS = ['unique', 'sparse', 'partialFilterExpression', 'expireAfterSeconds'];

/**
 * Every index a model's schema asks for.
 *
 * Mongoose's `schema.indexes()` covers `schema.index(...)` calls AND path-level
 * `unique: true` / `index: true`, so it is the whole declaration in one place.
 *
 * @param {import('mongoose').Model} model
 * @returns {{key: Object, options: Object}[]}
 */
function declaredIndexes(model) {
  return model.schema.indexes().map(([key, options = {}]) => ({ key, options }));
}

/** A stable string for an index's key, so two definitions can be compared. */
const keySignature = (key) => JSON.stringify(Object.entries(key));

/**
 * Do the significant options match? Name is deliberately excluded — an index
 * called `email_1` and one called `judge_account_email_unique` on the same key
 * with the same uniqueness are the same index as far as queries care.
 *
 * @param {Object} declared
 * @param {Object} existing - as returned by `collection.indexes()`
 * @returns {boolean}
 */
function optionsMatch(declared, existing) {
  return SIGNIFICANT_OPTIONS.every((option) => {
    const want = declared[option];
    const have = existing[option];
    if (option === 'partialFilterExpression') {
      return JSON.stringify(want || null) === JSON.stringify(have || null);
    }
    return (want || false) === (have || false);
  });
}

/**
 * Reconcile one model's indexes.
 *
 * @param {import('mongoose').Model} model
 * @param {Object} [options]
 * @param {boolean} [options.apply=true] - false reports without writing
 * @returns {Promise<{model: string, created: Object[], satisfied: Object[], conflicts: Object[], undeclared: Object[], failed: Object[]}>}
 */
async function reconcileModel(model, { apply = true } = {}) {
  const result = {
    model: model.modelName,
    created: [],
    satisfied: [],
    conflicts: [],
    undeclared: [],
    failed: [],
  };

  let existing = [];
  try {
    existing = await model.collection.indexes();
  } catch (error) {
    // A collection that has never been written to does not exist yet, so it has
    // no indexes to list. That is not a failure — creating an index below will
    // create the collection.
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
  }

  const existingByKey = new Map(existing.map((index) => [keySignature(index.key), index]));
  const declared = declaredIndexes(model);
  const declaredKeys = new Set(declared.map(({ key }) => keySignature(key)));

  for (const { key, options } of declared) {
    const signature = keySignature(key);
    const already = existingByKey.get(signature);

    if (already) {
      if (optionsMatch(options, already)) {
        // Present under some name, with the same meaning. Nothing to do — this
        // is the case migration 005 turned into a hard failure.
        result.satisfied.push({ key, name: already.name });
      } else {
        /*
         * Same key, DIFFERENT meaning — e.g. declared unique but built
         * non-unique. Reported, never silently rebuilt: dropping a unique index
         * to recreate it can succeed and then fail on the rebuild if duplicates
         * exist, leaving the collection with no constraint at all.
         */
        result.conflicts.push({
          key,
          name: already.name,
          declared: Object.fromEntries(SIGNIFICANT_OPTIONS.filter((o) => options[o]).map((o) => [o, options[o]])),
          existing: Object.fromEntries(SIGNIFICANT_OPTIONS.filter((o) => already[o]).map((o) => [o, already[o]])),
        });
      }
      continue;
    }

    if (!apply) {
      result.created.push({ key, name: options.name || null, pending: true });
      continue;
    }

    try {
      const name = await model.collection.createIndex(key, options);
      result.created.push({ key, name });
    } catch (error) {
      result.failed.push({ key, error: error.message });
    }
  }

  for (const index of existing) {
    if (index.name === '_id_') continue;
    if (declaredKeys.has(keySignature(index.key))) continue;
    // Created by a migration, or by hand, or left behind by a schema that has
    // since changed. Left in place — see the note at the top of this file.
    result.undeclared.push({ key: index.key, name: index.name });
  }

  return result;
}

/**
 * Reconcile every registered model.
 *
 * @param {import('mongoose')} mongoose
 * @param {Object} [options]
 * @param {boolean} [options.apply=true]
 * @returns {Promise<Object[]>} one result per model
 */
async function reconcileAll(mongoose, { apply = true } = {}) {
  const results = [];
  for (const name of mongoose.modelNames()) {
    results.push(await reconcileModel(mongoose.model(name), { apply }));
  }
  return results;
}

/**
 * Render the results as lines for a human.
 * @param {Object[]} results
 * @param {boolean} apply
 * @returns {string[]}
 */
function formatResults(results, apply) {
  const lines = [];
  let created = 0;
  let satisfied = 0;
  let conflicts = 0;
  let undeclared = 0;
  let failed = 0;

  for (const result of results) {
    const interesting = result.created.length + result.conflicts.length
      + result.undeclared.length + result.failed.length;
    satisfied += result.satisfied.length;

    if (interesting === 0) continue;

    lines.push(`  ${result.model}`);
    for (const index of result.created) {
      created += 1;
      lines.push(`    ${apply ? '+ created' : '+ would create'} ${JSON.stringify(index.key)}`);
    }
    for (const index of result.conflicts) {
      conflicts += 1;
      lines.push(
        `    ! conflict ${JSON.stringify(index.key)} exists as "${index.name}" with `
        + `${JSON.stringify(index.existing)}, schema declares ${JSON.stringify(index.declared)}`
      );
    }
    for (const index of result.undeclared) {
      undeclared += 1;
      lines.push(`    ? undeclared "${index.name}" ${JSON.stringify(index.key)} — left alone`);
    }
    for (const index of result.failed) {
      failed += 1;
      lines.push(`    x FAILED ${JSON.stringify(index.key)}: ${index.error}`);
    }
  }

  lines.unshift(
    `  ${satisfied} already correct, ${created} ${apply ? 'created' : 'to create'}, `
    + `${conflicts} conflict(s), ${undeclared} undeclared, ${failed} failed`
  );

  return lines;
}

module.exports = {
  declaredIndexes,
  reconcileModel,
  reconcileAll,
  formatResults,
  optionsMatch,
  keySignature,
};
