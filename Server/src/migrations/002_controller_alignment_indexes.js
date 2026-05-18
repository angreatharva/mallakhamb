const Team = require('../../models/Team');
const Player = require('../../models/Player');
const Competition = require('../../models/Competition');
const Transaction = require('../../models/Transaction');

async function up() {
  await Team.collection.createIndex({ coach: 1, isActive: 1 });
  await Team.collection.createIndex({ name: 1, isActive: 1 });
  await Player.collection.createIndex({ team: 1, isActive: 1 });
  await Competition.collection.createIndex({ status: 1, isDeleted: 1, startDate: 1 });
  await Transaction.collection.createIndex({ competition: 1, paymentStatus: 1, createdAt: -1 });
}

async function down() {
  await Team.collection.dropIndex('coach_1_isActive_1').catch(() => {});
  await Team.collection.dropIndex('name_1_isActive_1').catch(() => {});
  await Player.collection.dropIndex('team_1_isActive_1').catch(() => {});
  await Competition.collection.dropIndex('status_1_isDeleted_1_startDate_1').catch(() => {});
  await Transaction.collection.dropIndex('competition_1_paymentStatus_1_createdAt_-1').catch(() => {});
}

module.exports = { up, down };
