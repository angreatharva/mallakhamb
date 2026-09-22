/**
 * 004 — PerformanceOrder identity index.
 *
 * Production connects with `autoIndex: false` (infrastructure/database/
 * connection.js), so Mongoose never builds the index declared on the schema.
 * Without this migration nothing breaks visibly — reads and writes both work —
 * but the uniqueness that stops two simultaneous "Draw Lots" clicks leaving a
 * category with two competing running orders is simply absent.
 *
 * Safe to run against a populated collection: the index is new, so there is no
 * old one to drop and nothing to collide with unless duplicates were already
 * created by running the feature before this migration.
 */

const PerformanceOrder = require('../models/PerformanceOrder');

async function up() {
  await PerformanceOrder.collection.createIndex(
    { competition: 1, gender: 1, ageGroup: 1, competitionType: 1 },
    { unique: true, name: 'performance_order_identity_unique' }
  );
}

async function down() {
  await PerformanceOrder.collection.dropIndex('performance_order_identity_unique').catch(() => {});
}

module.exports = { up, down };
