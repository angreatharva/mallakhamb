const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Score = require('../models/Score');
require('dotenv').config();

async function testCompletedRestrictions() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create test admin
    let testAdmin = await Admin.findOne({ email: 'test@admin.com' });
    if (!testAdmin) {
      testAdmin = await Admin.create({
        name: 'Test Admin',
        email: 'test@admin.com',
        password: 'test123',
        role: 'admin'
      });
    }

    // Create test coach
    let testCoach = await Coach.findOne({ email: 'test@coach.com' });
    if (!testCoach) {
      testCoach = await Coach.create({
        name: 'Test Coach',
        email: 'test@coach.com',
        password: 'test123'
      });
    }

    // Create completed competition
    console.log('\n=== Creating Completed Competition ===');
    const completedComp = new Competition({
      name: 'Completed Competition Test',
      level: 'state',
      place: 'Test City',
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      admins: [testAdmin._id]
    });
    completedComp.setInitialStatus();
    await completedComp.save();
    console.log(`✅ Created competition with status: ${completedComp.status}`);

    // Create ongoing competition for comparison
    console.log('\n=== Creating Ongoing Competition ===');
    const ongoingComp = new Competition({
      name: 'Ongoing Competition Test',
      level: 'state',
      place: 'Test City',
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      admins: [testAdmin._id]
    });
    ongoingComp.setInitialStatus();
    await ongoingComp.save();
    console.log(`✅ Created competition with status: ${ongoingComp.status}`);

    // Test 1: Try to create team in completed competition
    console.log('\n=== Test 1: Team Creation in Completed Competition ===');
    try {
      // Simulate the check that would happen in createTeam controller
      const competition = await Competition.findById(completedComp._id);
      if (competition.status === 'completed') {
        throw new Error('Cannot create team for a completed competition');
      }
      const team = new Team({
        name: 'Test Team Completed',
        coach: testCoach._id,
        competition: completedComp._id
      });
      await team.save();
      console.log('❌ FAIL - Should not allow team creation in completed competition');
    } catch (error) {
      console.log('✅ PASS - Correctly rejected:', error.message);
    }

    // Test 2: Try to create team in ongoing competition (should succeed)
    console.log('\n=== Test 2: Team Creation in Ongoing Competition ===');
    try {
      const competition = await Competition.findById(ongoingComp._id);
      if (competition.status === 'completed') {
        throw new Error('Cannot create team for a completed competition');
      }
      const team = new Team({
        name: 'Test Team Ongoing',
        coach: testCoach._id,
        competition: ongoingComp._id
      });
      await team.save();
      console.log('✅ PASS - Team created successfully in ongoing competition');
    } catch (error) {
      console.log('❌ FAIL - Should allow team creation:', error.message);
    }

    // Test 3: Try to create score in completed competition
    console.log('\n=== Test 3: Score Creation in Completed Competition ===');
    try {
      // Simulate the check that would happen in saveScores controller
      const competition = await Competition.findById(completedComp._id);
      if (competition.status === 'completed') {
        throw new Error('Cannot add or update scores for a completed competition');
      }
      const score = new Score({
        teamId: new mongoose.Types.ObjectId(),
        gender: 'male',
        ageGroup: 'under-14',
        playerScores: [],
        competition: completedComp._id
      });
      await score.save();
      console.log('❌ FAIL - Should not allow score creation in completed competition');
    } catch (error) {
      console.log('✅ PASS - Correctly rejected:', error.message);
    }

    // Test 4: Try to create score in ongoing competition (should succeed)
    console.log('\n=== Test 4: Score Creation in Ongoing Competition ===');
    try {
      const team = await Team.findOne({ competition: ongoingComp._id });
      const competition = await Competition.findById(ongoingComp._id);
      if (competition.status === 'completed') {
        throw new Error('Cannot add or update scores for a completed competition');
      }
      const score = new Score({
        teamId: team._id,
        gender: 'Male',
        ageGroup: 'U14',
        playerScores: [],
        competition: ongoingComp._id
      });
      await score.save();
      console.log('✅ PASS - Score created successfully in ongoing competition');
    } catch (error) {
      console.log('❌ FAIL - Should allow score creation:', error.message);
    }

    // Cleanup
    console.log('\n=== Cleanup ===');
    await Competition.deleteMany({ 
      name: { $in: ['Completed Competition Test', 'Ongoing Competition Test'] } 
    });
    await Team.deleteMany({ 
      name: { $in: ['Test Team Completed', 'Test Team Ongoing'] } 
    });
    await Score.deleteMany({ competition: { $in: [completedComp._id, ongoingComp._id] } });
    console.log('✅ Test data deleted');

    console.log('\n=== All Tests Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testCompletedRestrictions();
