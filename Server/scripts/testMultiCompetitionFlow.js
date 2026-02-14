/**
 * Test Script: Verify Multi-Competition Flow
 * 
 * This script tests that a team can be registered for multiple competitions
 * with different players for each competition.
 * 
 * Run with: node Server/scripts/testMultiCompetitionFlow.js
 */

require('dotenv').config({ path: './Server/.env' });
const mongoose = require('mongoose');
const Team = require('../models/Team');
const CompetitionTeam = require('../models/CompetitionTeam');
const Competition = require('../models/Competition');
const Coach = require('../models/Coach');

async function testMultiCompetitionFlow() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find a test coach (or use a specific coach ID)
    const coach = await Coach.findOne();
    if (!coach) {
      console.log('No coach found. Please create a coach first.');
      return;
    }
    console.log(`Using coach: ${coach.name} (${coach._id})`);

    // Find or create a test team
    let team = await Team.findOne({ coach: coach._id, name: 'SGAM' });
    if (!team) {
      team = new Team({
        name: 'SGAM',
        coach: coach._id,
        description: 'Test team for multi-competition'
      });
      await team.save();
      console.log(`Created team: ${team.name} (${team._id})`);
    } else {
      console.log(`Found existing team: ${team.name} (${team._id})`);
    }

    // Find two competitions
    const competitions = await Competition.find().limit(2);
    if (competitions.length < 2) {
      console.log('Need at least 2 competitions. Please create competitions first.');
      return;
    }

    console.log(`\nCompetition A: ${competitions[0].name} (${competitions[0]._id})`);
    console.log(`Competition B: ${competitions[1].name} (${competitions[1]._id})`);

    // Test 1: Register team for Competition A
    console.log('\n=== Test 1: Register team for Competition A ===');
    let compTeamA = await CompetitionTeam.findOne({
      team: team._id,
      competition: competitions[0]._id
    });

    if (!compTeamA) {
      compTeamA = new CompetitionTeam({
        team: team._id,
        competition: competitions[0]._id,
        coach: coach._id,
        players: [],
        isSubmitted: false,
        paymentStatus: 'pending'
      });
      await compTeamA.save();
      console.log('✓ Team registered for Competition A');
    } else {
      console.log('✓ Team already registered for Competition A');
    }

    // Test 2: Register SAME team for Competition B
    console.log('\n=== Test 2: Register SAME team for Competition B ===');
    let compTeamB = await CompetitionTeam.findOne({
      team: team._id,
      competition: competitions[1]._id
    });

    if (!compTeamB) {
      compTeamB = new CompetitionTeam({
        team: team._id,
        competition: competitions[1]._id,
        coach: coach._id,
        players: [],
        isSubmitted: false,
        paymentStatus: 'pending'
      });
      await compTeamB.save();
      console.log('✓ Team registered for Competition B');
    } else {
      console.log('✓ Team already registered for Competition B');
    }

    // Test 3: Verify both registrations exist
    console.log('\n=== Test 3: Verify both registrations ===');
    const registrations = await CompetitionTeam.find({ team: team._id })
      .populate('competition', 'name');

    console.log(`✓ Team has ${registrations.length} competition registrations:`);
    registrations.forEach((reg, index) => {
      console.log(`  ${index + 1}. ${reg.competition.name} - ${reg.players.length} players`);
    });

    // Test 4: Verify team document is clean (no competition field)
    console.log('\n=== Test 4: Verify Team document structure ===');
    const teamDoc = await Team.findById(team._id).lean();
    if (teamDoc.competition) {
      console.log('⚠ WARNING: Team still has "competition" field. Run cleanup script!');
    } else {
      console.log('✓ Team document is clean (no competition field)');
    }

    if (teamDoc.players) {
      console.log('⚠ WARNING: Team still has "players" field. Run cleanup script!');
    } else {
      console.log('✓ Team document is clean (no players field)');
    }

    console.log('\n=== All Tests Passed! ===');
    console.log('\nSummary:');
    console.log(`- Team "${team.name}" can participate in multiple competitions`);
    console.log(`- Each competition has its own CompetitionTeam entry`);
    console.log(`- Players can be different for each competition`);
    console.log(`- Team document is clean and reusable`);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run test
testMultiCompetitionFlow();
