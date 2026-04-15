/**
 * Migration: Initial Database Indexes
 * 
 * Creates indexes for all models to optimize query performance
 * Based on Requirements 16.1 (Performance Optimization) and 24.1 (Database Migration Support)
 */

const Player = require('../../models/Player');
const Coach = require('../../models/Coach');
const Admin = require('../../models/Admin');
const Judge = require('../../models/Judge');
const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Score = require('../../models/Score');
const Transaction = require('../../models/Transaction');

/**
 * Run the migration - Create indexes
 */
async function up() {
  console.log('Creating database indexes...');
  
  try {
    // Player indexes
    console.log('Creating Player indexes...');
    await Player.collection.createIndex({ email: 1 }, { unique: true });
    await Player.collection.createIndex({ team: 1 });
    await Player.collection.createIndex({ ageGroup: 1, gender: 1 });
    await Player.collection.createIndex({ isActive: 1 });
    await Player.collection.createIndex({ createdAt: -1 });
    console.log('✓ Player indexes created');
    
    // Coach indexes
    console.log('Creating Coach indexes...');
    await Coach.collection.createIndex({ email: 1 }, { unique: true });
    await Coach.collection.createIndex({ team: 1 });
    await Coach.collection.createIndex({ isActive: 1 });
    await Coach.collection.createIndex({ createdAt: -1 });
    console.log('✓ Coach indexes created');
    
    // Admin indexes
    console.log('Creating Admin indexes...');
    await Admin.collection.createIndex({ email: 1 }, { unique: true });
    await Admin.collection.createIndex({ role: 1 });
    await Admin.collection.createIndex({ isActive: 1 });
    await Admin.collection.createIndex({ competitions: 1 });
    await Admin.collection.createIndex({ createdAt: -1 });
    console.log('✓ Admin indexes created');
    
    // Judge indexes
    console.log('Creating Judge indexes...');
    await Judge.collection.createIndex({ competition: 1 });
    await Judge.collection.createIndex({ gender: 1, ageGroup: 1, judgeNo: 1, competition: 1 }, { unique: true });
    await Judge.collection.createIndex({ gender: 1, ageGroup: 1, judgeType: 1, competition: 1 }, { unique: true });
    await Judge.collection.createIndex({ competitionTypes: 1 });
    // Partial index for username - only index non-empty usernames
    await Judge.collection.createIndex(
      { username: 1, competition: 1 }, 
      { 
        unique: true,
        partialFilterExpression: { 
          username: { $exists: true, $gt: '' }
        }
      }
    );
    await Judge.collection.createIndex({ isActive: 1 });
    console.log('✓ Judge indexes created');
    
    // Competition indexes (some already exist in schema, but ensuring all are present)
    console.log('Creating Competition indexes...');
    await Competition.collection.createIndex({ name: 1, year: 1, place: 1 }, { unique: true });
    await Competition.collection.createIndex({ status: 1 });
    await Competition.collection.createIndex({ startDate: 1 });
    await Competition.collection.createIndex({ status: 1, startDate: 1 });
    await Competition.collection.createIndex({ year: 1 });
    await Competition.collection.createIndex({ admins: 1 });
    await Competition.collection.createIndex({ competitionTypes: 1 });
    await Competition.collection.createIndex({ 'registeredTeams.team': 1 });
    await Competition.collection.createIndex({ 'registeredTeams.coach': 1 });
    await Competition.collection.createIndex({ 'registeredTeams.paymentStatus': 1 });
    await Competition.collection.createIndex({ 'ageGroups.gender': 1, 'ageGroups.ageGroup': 1 });
    await Competition.collection.createIndex({ 
      'startedAgeGroups.gender': 1, 
      'startedAgeGroups.ageGroup': 1, 
      'startedAgeGroups.competitionType': 1 
    });
    await Competition.collection.createIndex({ isDeleted: 1 });
    await Competition.collection.createIndex({ createdAt: -1 });
    console.log('✓ Competition indexes created');
    
    // Team indexes
    console.log('Creating Team indexes...');
    await Team.collection.createIndex({ name: 1, coach: 1 }, { unique: true });
    await Team.collection.createIndex({ coach: 1 });
    await Team.collection.createIndex({ isActive: 1 });
    await Team.collection.createIndex({ createdAt: -1 });
    console.log('✓ Team indexes created');
    
    // Score indexes
    console.log('Creating Score indexes...');
    await Score.collection.createIndex({ competition: 1 });
    await Score.collection.createIndex({ teamId: 1, gender: 1, ageGroup: 1, competition: 1 });
    await Score.collection.createIndex({ competition: 1, gender: 1, ageGroup: 1 });
    await Score.collection.createIndex({ competition: 1, competitionType: 1 });
    await Score.collection.createIndex({ 'playerScores.playerId': 1 });
    await Score.collection.createIndex({ isLocked: 1 });
    await Score.collection.createIndex({ createdAt: -1 });
    console.log('✓ Score indexes created');
    
    // Transaction indexes
    console.log('Creating Transaction indexes...');
    await Transaction.collection.createIndex({ competition: 1, createdAt: -1 });
    await Transaction.collection.createIndex({ competition: 1, source: 1, type: 1 });
    await Transaction.collection.createIndex({ team: 1 });
    await Transaction.collection.createIndex({ coach: 1 });
    await Transaction.collection.createIndex({ admin: 1 });
    await Transaction.collection.createIndex({ player: 1 });
    await Transaction.collection.createIndex({ paymentStatus: 1 });
    await Transaction.collection.createIndex({ createdAt: -1 });
    console.log('✓ Transaction indexes created');
    
    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
    throw error;
  }
}

/**
 * Rollback the migration - Drop indexes
 */
async function down() {
  console.log('Dropping database indexes...');
  
  try {
    // Player indexes
    console.log('Dropping Player indexes...');
    await Player.collection.dropIndex('email_1').catch(() => {});
    await Player.collection.dropIndex('team_1').catch(() => {});
    await Player.collection.dropIndex('ageGroup_1_gender_1').catch(() => {});
    await Player.collection.dropIndex('isActive_1').catch(() => {});
    await Player.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Player indexes dropped');
    
    // Coach indexes
    console.log('Dropping Coach indexes...');
    await Coach.collection.dropIndex('email_1').catch(() => {});
    await Coach.collection.dropIndex('team_1').catch(() => {});
    await Coach.collection.dropIndex('isActive_1').catch(() => {});
    await Coach.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Coach indexes dropped');
    
    // Admin indexes
    console.log('Dropping Admin indexes...');
    await Admin.collection.dropIndex('email_1').catch(() => {});
    await Admin.collection.dropIndex('role_1').catch(() => {});
    await Admin.collection.dropIndex('isActive_1').catch(() => {});
    await Admin.collection.dropIndex('competitions_1').catch(() => {});
    await Admin.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Admin indexes dropped');
    
    // Judge indexes
    console.log('Dropping Judge indexes...');
    await Judge.collection.dropIndex('competition_1').catch(() => {});
    await Judge.collection.dropIndex('gender_1_ageGroup_1_judgeNo_1_competition_1').catch(() => {});
    await Judge.collection.dropIndex('gender_1_ageGroup_1_judgeType_1_competition_1').catch(() => {});
    await Judge.collection.dropIndex('competitionTypes_1').catch(() => {});
    await Judge.collection.dropIndex('username_1_competition_1').catch(() => {});
    await Judge.collection.dropIndex('isActive_1').catch(() => {});
    console.log('✓ Judge indexes dropped');
    
    // Competition indexes
    console.log('Dropping Competition indexes...');
    await Competition.collection.dropIndex('name_1_year_1_place_1').catch(() => {});
    await Competition.collection.dropIndex('status_1').catch(() => {});
    await Competition.collection.dropIndex('startDate_1').catch(() => {});
    await Competition.collection.dropIndex('status_1_startDate_1').catch(() => {});
    await Competition.collection.dropIndex('year_1').catch(() => {});
    await Competition.collection.dropIndex('admins_1').catch(() => {});
    await Competition.collection.dropIndex('competitionTypes_1').catch(() => {});
    await Competition.collection.dropIndex('registeredTeams.team_1').catch(() => {});
    await Competition.collection.dropIndex('registeredTeams.coach_1').catch(() => {});
    await Competition.collection.dropIndex('registeredTeams.paymentStatus_1').catch(() => {});
    await Competition.collection.dropIndex('ageGroups.gender_1_ageGroups.ageGroup_1').catch(() => {});
    await Competition.collection.dropIndex('startedAgeGroups.gender_1_startedAgeGroups.ageGroup_1_startedAgeGroups.competitionType_1').catch(() => {});
    await Competition.collection.dropIndex('isDeleted_1').catch(() => {});
    await Competition.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Competition indexes dropped');
    
    // Team indexes
    console.log('Dropping Team indexes...');
    await Team.collection.dropIndex('name_1_coach_1').catch(() => {});
    await Team.collection.dropIndex('coach_1').catch(() => {});
    await Team.collection.dropIndex('isActive_1').catch(() => {});
    await Team.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Team indexes dropped');
    
    // Score indexes
    console.log('Dropping Score indexes...');
    await Score.collection.dropIndex('competition_1').catch(() => {});
    await Score.collection.dropIndex('teamId_1_gender_1_ageGroup_1_competition_1').catch(() => {});
    await Score.collection.dropIndex('competition_1_gender_1_ageGroup_1').catch(() => {});
    await Score.collection.dropIndex('competition_1_competitionType_1').catch(() => {});
    await Score.collection.dropIndex('playerScores.playerId_1').catch(() => {});
    await Score.collection.dropIndex('isLocked_1').catch(() => {});
    await Score.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Score indexes dropped');
    
    // Transaction indexes
    console.log('Dropping Transaction indexes...');
    await Transaction.collection.dropIndex('competition_1_createdAt_-1').catch(() => {});
    await Transaction.collection.dropIndex('competition_1_source_1_type_1').catch(() => {});
    await Transaction.collection.dropIndex('team_1').catch(() => {});
    await Transaction.collection.dropIndex('coach_1').catch(() => {});
    await Transaction.collection.dropIndex('admin_1').catch(() => {});
    await Transaction.collection.dropIndex('player_1').catch(() => {});
    await Transaction.collection.dropIndex('paymentStatus_1').catch(() => {});
    await Transaction.collection.dropIndex('createdAt_-1').catch(() => {});
    console.log('✓ Transaction indexes dropped');
    
    console.log('✅ All indexes dropped successfully');
  } catch (error) {
    console.error('❌ Error dropping indexes:', error.message);
    throw error;
  }
}

module.exports = { up, down };
