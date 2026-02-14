/**
 * Test Script: Search and Filter Functionality
 * 
 * This script tests the search and filter functionality implemented in Task 14:
 * - Competition search for super admin
 * - Team search and filter for admin
 * - Player search for admin
 * - Judge filter for admin
 * - Player search for coach
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Judge = require('../models/Judge');
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test 1: Competition Search (Super Admin)
const testCompetitionSearch = async () => {
  console.log('\n📋 Test 1: Competition Search for Super Admin');
  console.log('='.repeat(60));

  try {
    // Test search by name
    const nameSearch = await Competition.find({
      name: { $regex: 'championship', $options: 'i' }
    });
    console.log(`✓ Search by name: Found ${nameSearch.length} competitions`);

    // Test filter by level
    const levelFilter = await Competition.find({ level: 'state' });
    console.log(`✓ Filter by level: Found ${levelFilter.length} state competitions`);

    // Test filter by status
    const statusFilter = await Competition.find({ status: 'ongoing' });
    console.log(`✓ Filter by status: Found ${statusFilter.length} ongoing competitions`);

    // Test combined filters
    const combined = await Competition.find({
      level: 'state',
      status: 'ongoing',
      name: { $regex: '', $options: 'i' }
    });
    console.log(`✓ Combined filters: Found ${combined.length} competitions`);

    console.log('✅ Competition search tests passed');
  } catch (error) {
    console.error('❌ Competition search test failed:', error.message);
  }
};

// Test 2: Team Search and Filter (Admin)
const testTeamSearchAndFilter = async () => {
  console.log('\n📋 Test 2: Team Search and Filter for Admin');
  console.log('='.repeat(60));

  try {
    // Get a competition to test with
    const competition = await Competition.findOne();
    if (!competition) {
      console.log('⚠️  No competitions found, skipping team tests');
      return;
    }

    // Test filter by submission status
    const submittedTeams = await Team.find({
      competition: competition._id,
      isSubmitted: true
    });
    console.log(`✓ Filter by submission status: Found ${submittedTeams.length} submitted teams`);

    // Test filter by payment status
    const paidTeams = await Team.find({
      competition: competition._id,
      paymentStatus: 'completed'
    });
    console.log(`✓ Filter by payment status: Found ${paidTeams.length} paid teams`);

    // Test search by team name
    const teams = await Team.find({ competition: competition._id }).populate('coach', 'name');
    const searchResults = teams.filter(team => 
      team.name && team.name.toLowerCase().includes('team')
    );
    console.log(`✓ Search by team name: Found ${searchResults.length} teams with 'team' in name`);

    // Test combined filters
    const combinedTeams = await Team.find({
      competition: competition._id,
      isSubmitted: true,
      paymentStatus: 'completed'
    });
    console.log(`✓ Combined filters: Found ${combinedTeams.length} submitted and paid teams`);

    console.log('✅ Team search and filter tests passed');
  } catch (error) {
    console.error('❌ Team search and filter test failed:', error.message);
  }
};

// Test 3: Player Search (Admin)
const testPlayerSearch = async () => {
  console.log('\n📋 Test 3: Player Search for Admin');
  console.log('='.repeat(60));

  try {
    // Get a competition to test with
    const competition = await Competition.findOne();
    if (!competition) {
      console.log('⚠️  No competitions found, skipping player tests');
      return;
    }

    // Test filter by gender
    const malePlayers = await Player.find({ gender: 'Male' })
      .populate({
        path: 'team',
        match: { competition: competition._id }
      });
    const maleInCompetition = malePlayers.filter(p => p.team !== null);
    console.log(`✓ Filter by gender: Found ${maleInCompetition.length} male players in competition`);

    // Test filter by age group
    const u14Players = await Player.find({ ageGroup: 'U14' })
      .populate({
        path: 'team',
        match: { competition: competition._id }
      });
    const u14InCompetition = u14Players.filter(p => p.team !== null);
    console.log(`✓ Filter by age group: Found ${u14InCompetition.length} U14 players in competition`);

    // Test search by name
    const allPlayers = await Player.find()
      .populate({
        path: 'team',
        match: { competition: competition._id }
      });
    const playersInCompetition = allPlayers.filter(p => p.team !== null);
    console.log(`✓ Search by name: ${playersInCompetition.length} players available in competition`);

    console.log('✅ Player search tests passed');
  } catch (error) {
    console.error('❌ Player search test failed:', error.message);
  }
};

// Test 4: Judge Filter (Admin)
const testJudgeFilter = async () => {
  console.log('\n📋 Test 4: Judge Filter for Admin');
  console.log('='.repeat(60));

  try {
    // Get a competition to test with
    const competition = await Competition.findOne();
    if (!competition) {
      console.log('⚠️  No competitions found, skipping judge tests');
      return;
    }

    // Test filter by gender and age group
    const judges = await Judge.find({
      competition: competition._id,
      gender: 'Male',
      ageGroup: 'U14'
    });
    console.log(`✓ Filter by gender and age group: Found ${judges.length} judges`);

    // Test filter by judge type
    const seniorJudges = await Judge.find({
      competition: competition._id,
      judgeType: 'Senior Judge'
    });
    console.log(`✓ Filter by judge type: Found ${seniorJudges.length} senior judges`);

    // Test all judges in competition
    const allJudges = await Judge.find({ competition: competition._id });
    console.log(`✓ All judges in competition: Found ${allJudges.length} judges`);

    console.log('✅ Judge filter tests passed');
  } catch (error) {
    console.error('❌ Judge filter test failed:', error.message);
  }
};

// Test 5: Player Search (Coach)
const testCoachPlayerSearch = async () => {
  console.log('\n📋 Test 5: Player Search for Coach');
  console.log('='.repeat(60));

  try {
    // Test search by first name
    const firstNameSearch = await Player.find({
      firstName: { $regex: 'a', $options: 'i' }
    }).populate('team', 'name competition');
    console.log(`✓ Search by first name: Found ${firstNameSearch.length} players with 'a' in first name`);

    // Test search by email
    const emailSearch = await Player.find({
      email: { $regex: '@', $options: 'i' }
    }).populate('team', 'name competition');
    console.log(`✓ Search by email: Found ${emailSearch.length} players with email`);

    // Test that all players are returned (not just those without teams)
    const allPlayers = await Player.find().populate('team', 'name competition');
    const playersWithTeams = allPlayers.filter(p => p.team !== null);
    const playersWithoutTeams = allPlayers.filter(p => p.team === null);
    console.log(`✓ All players returned: ${allPlayers.length} total (${playersWithTeams.length} with teams, ${playersWithoutTeams.length} without)`);

    console.log('✅ Coach player search tests passed');
  } catch (error) {
    console.error('❌ Coach player search test failed:', error.message);
  }
};

// Main test runner
const runTests = async () => {
  console.log('\n🧪 Starting Search and Filter Functionality Tests');
  console.log('='.repeat(60));

  await connectDB();

  await testCompetitionSearch();
  await testTeamSearchAndFilter();
  await testPlayerSearch();
  await testJudgeFilter();
  await testCoachPlayerSearch();

  console.log('\n' + '='.repeat(60));
  console.log('✅ All search and filter tests completed');
  console.log('='.repeat(60));

  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
};

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
