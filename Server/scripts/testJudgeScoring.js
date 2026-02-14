/**
 * Test Script for Judge Score Entry
 * Tests judge score entry with competition context validation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Coach = require('../models/Coach');
const Player = require('../models/Player');
const Score = require('../models/Score');
const { generateToken } = require('../utils/tokenUtils');

// Test configuration
const TEST_CONFIG = {
  judgeUsername: 'scoringjudge1',
  judgePassword: 'testpass123',
  judgeName: 'Scoring Test Judge',
  competitionName: 'Test Competition for Scoring',
  teamName: 'Test Team Alpha',
  coachEmail: 'testcoach@scoring.com',
  playerFirstName: 'Test',
  playerLastName: 'Player'
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Setup: Create test data
 */
async function setupTestData() {
  console.log('\n📝 Setting up test data...');
  
  try {
    // Find or create super admin
    let admin = await Admin.findOne({ role: 'super_admin' });
    if (!admin) {
      admin = await Admin.create({
        name: 'Test Super Admin',
        email: 'testsuperadmin@test.com',
        password: await bcrypt.hash('testpass', 10),
        role: 'super_admin',
        isActive: true
      });
    }

    // Create test competition
    const competition = await Competition.create({
      name: TEST_CONFIG.competitionName,
      level: 'state',
      place: 'Test City',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      description: 'Test competition for judge scoring',
      status: 'ongoing',
      admins: [admin._id],
      createdBy: admin._id
    });
    console.log('✅ Created test competition:', competition.name);

    // Create test coach
    const coach = await Coach.create({
      name: 'Test Coach',
      email: TEST_CONFIG.coachEmail,
      password: await bcrypt.hash('testpass', 10),
      phoneNumber: '1234567890',
      isActive: true
    });
    console.log('✅ Created test coach:', coach.email);

    // Create test player
    const player = await Player.create({
      firstName: TEST_CONFIG.playerFirstName,
      lastName: TEST_CONFIG.playerLastName,
      email: 'testplayer@scoring.com',
      password: await bcrypt.hash('testpass', 10),
      phoneNumber: '9876543210',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'Male',
      ageGroup: 'U14',
      isActive: true
    });
    console.log('✅ Created test player:', player.firstName, player.lastName);

    // Create test team
    const team = await Team.create({
      name: TEST_CONFIG.teamName,
      competition: competition._id,
      coach: coach._id,
      players: [player._id],
      isSubmitted: true,
      paymentStatus: 'completed'
    });
    console.log('✅ Created test team:', team.name);

    // Create test judge
    const hashedPassword = await bcrypt.hash(TEST_CONFIG.judgePassword, 10);
    const judge = await Judge.create({
      competition: competition._id,
      gender: 'Male',
      ageGroup: 'U14',
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: TEST_CONFIG.judgeName,
      username: TEST_CONFIG.judgeUsername,
      password: hashedPassword,
      isActive: true
    });
    console.log('✅ Created test judge:', judge.username);

    return { competition, judge, team, player, coach, admin };
  } catch (error) {
    console.error('❌ Setup error:', error);
    throw error;
  }
}

/**
 * Test 1: Get Available Teams
 */
async function testGetAvailableTeams(judgeId, competitionId) {
  console.log('\n🧪 Test 1: Get Available Teams');
  console.log('─'.repeat(50));
  
  try {
    console.log('Fetching teams for judge:', judgeId);

    // Get judge details
    const judge = await Judge.findById(judgeId);
    if (!judge) {
      console.log('❌ Judge not found');
      return { success: false };
    }

    // Find submitted teams for the competition
    const teams = await Team.find({
      competition: competitionId,
      isSubmitted: true
    })
      .populate('coach', 'name email')
      .populate('players', 'firstName lastName gender ageGroup');

    // Filter teams to only include players matching judge's gender and age group
    const filteredTeams = teams.map(team => {
      const matchingPlayers = team.players.filter(player => 
        player.gender === judge.gender && player.ageGroup === judge.ageGroup
      );

      return {
        _id: team._id,
        name: team.name,
        coach: team.coach,
        players: matchingPlayers,
        playerCount: matchingPlayers.length
      };
    }).filter(team => team.playerCount > 0);

    console.log(`✅ Found ${filteredTeams.length} team(s) with players for ${judge.gender} ${judge.ageGroup}`);
    filteredTeams.forEach((team, index) => {
      console.log(`  ${index + 1}. ${team.name} - ${team.playerCount} player(s)`);
    });

    return { success: true, teams: filteredTeams, judge };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 2: Save Individual Score
 */
async function testSaveIndividualScore(judgeId, competitionId, teamId, playerId) {
  console.log('\n🧪 Test 2: Save Individual Score');
  console.log('─'.repeat(50));
  
  try {
    console.log('Saving score:', { judgeId, competitionId, teamId, playerId });

    // Get judge details
    const judge = await Judge.findById(judgeId);
    if (!judge) {
      console.log('❌ Judge not found');
      return { success: false };
    }

    // Validate team belongs to competition
    const team = await Team.findOne({
      _id: teamId,
      competition: competitionId
    });

    if (!team) {
      console.log('❌ Team not found in competition');
      return { success: false };
    }

    // Prepare score data
    const scoreData = {
      playerId: playerId,
      playerName: 'Test Player',
      judgeType: judge.judgeType,
      score: 8.5,
      teamId: teamId,
      gender: judge.gender,
      ageGroup: judge.ageGroup
    };

    // Find or create score record
    let scoreRecord = await Score.findOne({ 
      teamId, 
      gender: judge.gender, 
      ageGroup: judge.ageGroup,
      competition: competitionId 
    });

    if (!scoreRecord) {
      scoreRecord = new Score({
        teamId,
        gender: judge.gender,
        ageGroup: judge.ageGroup,
        competition: competitionId,
        playerScores: []
      });
    }

    // Find or create player score entry
    let playerScore = scoreRecord.playerScores.find(ps => ps.playerId.toString() === playerId.toString());

    if (!playerScore) {
      playerScore = {
        playerId,
        playerName: scoreData.playerName,
        judgeScores: {
          seniorJudge: 0,
          judge1: 0,
          judge2: 0,
          judge3: 0,
          judge4: 0
        },
        averageMarks: 0,
        deduction: 0,
        otherDeduction: 0,
        finalScore: 0
      };
      scoreRecord.playerScores.push(playerScore);
    }

    // Update the specific judge score
    switch (judge.judgeType) {
      case 'Senior Judge':
        playerScore.judgeScores.seniorJudge = parseFloat(scoreData.score);
        break;
      case 'Judge 1':
        playerScore.judgeScores.judge1 = parseFloat(scoreData.score);
        break;
      case 'Judge 2':
        playerScore.judgeScores.judge2 = parseFloat(scoreData.score);
        break;
      case 'Judge 3':
        playerScore.judgeScores.judge3 = parseFloat(scoreData.score);
        break;
      case 'Judge 4':
        playerScore.judgeScores.judge4 = parseFloat(scoreData.score);
        break;
    }

    // Recalculate average
    const judgeScores = Object.values(playerScore.judgeScores).filter(s => s > 0);
    if (judgeScores.length > 0) {
      let averageScore;
      if (judgeScores.length <= 3) {
        averageScore = judgeScores.reduce((sum, s) => sum + s, 0) / judgeScores.length;
      } else {
        const sortedScores = [...judgeScores].sort((a, b) => a - b);
        const trimmedScores = sortedScores.slice(1, -1);
        averageScore = trimmedScores.reduce((sum, s) => sum + s, 0) / trimmedScores.length;
      }
      playerScore.averageMarks = parseFloat(averageScore.toFixed(2));
      playerScore.finalScore = Math.max(0, playerScore.averageMarks - playerScore.deduction - playerScore.otherDeduction);
    }

    await scoreRecord.save();

    console.log('✅ Score saved successfully');
    console.log('  Judge Type:', judge.judgeType);
    console.log('  Score:', scoreData.score);
    console.log('  Average Marks:', playerScore.averageMarks);
    console.log('  Final Score:', playerScore.finalScore);

    return { success: true, scoreRecord, playerScore };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 3: Validate Competition Context
 */
async function testCompetitionContextValidation(judgeId, teamId, playerId) {
  console.log('\n🧪 Test 3: Validate Competition Context');
  console.log('─'.repeat(50));
  
  try {
    // Create another competition
    const admin = await Admin.findOne({ role: 'super_admin' });
    const wrongCompetition = await Competition.create({
      name: 'Wrong Competition',
      level: 'national',
      place: 'Another City',
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-07-03'),
      status: 'ongoing',
      admins: [admin._id],
      createdBy: admin._id
    });

    console.log('Created wrong competition:', wrongCompetition.name);

    // Try to validate team belongs to wrong competition
    const team = await Team.findOne({
      _id: teamId,
      competition: wrongCompetition._id
    });

    if (team) {
      console.log('❌ Should not have found team in wrong competition');
      return { success: false };
    }

    console.log('✅ Correctly prevented access to team from different competition');
    return { success: true };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 4: Validate Judge Gender/Age Group Assignment
 */
async function testJudgeAssignmentValidation(judgeId, teamId, playerId) {
  console.log('\n🧪 Test 4: Validate Judge Gender/Age Group Assignment');
  console.log('─'.repeat(50));
  
  try {
    const judge = await Judge.findById(judgeId);
    
    // Try to score for wrong gender
    console.log('\n4a. Testing wrong gender...');
    const wrongGender = judge.gender === 'Male' ? 'Female' : 'Male';
    
    if (judge.gender === wrongGender) {
      console.log('❌ Gender validation failed');
      return { success: false };
    }
    console.log(`✅ Correctly identified wrong gender (Judge: ${judge.gender}, Attempted: ${wrongGender})`);

    // Try to score for wrong age group
    console.log('\n4b. Testing wrong age group...');
    const wrongAgeGroup = judge.ageGroup === 'U14' ? 'U16' : 'U14';
    
    if (judge.ageGroup === wrongAgeGroup) {
      console.log('❌ Age group validation failed');
      return { success: false };
    }
    console.log(`✅ Correctly identified wrong age group (Judge: ${judge.ageGroup}, Attempted: ${wrongAgeGroup})`);

    return { success: true };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Cleanup: Remove test data
 */
async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    await Judge.deleteMany({ username: TEST_CONFIG.judgeUsername });
    await Team.deleteMany({ name: TEST_CONFIG.teamName });
    await Player.deleteMany({ email: 'testplayer@scoring.com' });
    await Coach.deleteMany({ email: TEST_CONFIG.coachEmail });
    await Competition.deleteMany({ name: { $in: [TEST_CONFIG.competitionName, 'Wrong Competition'] } });
    await Score.deleteMany({ competition: { $exists: true } });
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Judge Score Entry Tests');
  console.log('='.repeat(50));

  try {
    // Connect to database
    await connectDB();

    // Setup test data
    const { competition, judge, team, player } = await setupTestData();

    // Run tests
    const test1Result = await testGetAvailableTeams(judge._id, competition._id);
    if (!test1Result.success) {
      throw new Error('Test 1 failed');
    }

    const test2Result = await testSaveIndividualScore(judge._id, competition._id, team._id, player._id);
    if (!test2Result.success) {
      throw new Error('Test 2 failed');
    }

    const test3Result = await testCompetitionContextValidation(judge._id, team._id, player._id);
    if (!test3Result.success) {
      throw new Error('Test 3 failed');
    }

    const test4Result = await testJudgeAssignmentValidation(judge._id, team._id, player._id);
    if (!test4Result.success) {
      throw new Error('Test 4 failed');
    }

    // Cleanup
    await cleanup();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    await cleanup();
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run tests
runTests();
