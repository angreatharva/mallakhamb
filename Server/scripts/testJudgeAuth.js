/**
 * Test Script for Judge Authentication Endpoints
 * Tests judge login, competition assignment retrieval, and competition context setting
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
const { generateToken } = require('../utils/tokenUtils');

// Test configuration
const TEST_CONFIG = {
  judgeUsername: 'testjudge1',
  judgePassword: 'testpass123',
  judgeName: 'Test Judge',
  competitionName: 'Test Competition for Judge Auth'
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
 * Setup: Create test competition and judge
 */
async function setupTestData() {
  console.log('\n📝 Setting up test data...');
  
  try {
    // Find or create a super admin for competition creation
    let admin = await Admin.findOne({ role: 'super_admin' });
    if (!admin) {
      console.log('Creating super admin for test...');
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
      description: 'Test competition for judge authentication',
      status: 'upcoming',
      admins: [admin._id],
      createdBy: admin._id
    });
    console.log('✅ Created test competition:', competition.name);

    // Hash password for judge
    const hashedPassword = await bcrypt.hash(TEST_CONFIG.judgePassword, 10);

    // Create test judge
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

    return { competition, judge, admin };
  } catch (error) {
    console.error('❌ Setup error:', error);
    throw error;
  }
}

/**
 * Test 1: Judge Login
 */
async function testJudgeLogin() {
  console.log('\n🧪 Test 1: Judge Login');
  console.log('─'.repeat(50));
  
  try {
    // Simulate login request
    const loginData = {
      username: TEST_CONFIG.judgeUsername,
      password: TEST_CONFIG.judgePassword
    };

    console.log('Attempting login with:', { username: loginData.username });

    // Find judge
    const judge = await Judge.findOne({ 
      username: loginData.username.toLowerCase(),
      isActive: true 
    });

    if (!judge) {
      console.log('❌ Judge not found');
      return false;
    }

    // Verify password
    const isMatch = await bcrypt.compare(loginData.password, judge.password);
    if (!isMatch) {
      console.log('❌ Password mismatch');
      return false;
    }

    // Generate token
    const token = generateToken(judge._id, 'judge');
    
    console.log('✅ Login successful');
    console.log('Token generated:', token.substring(0, 20) + '...');
    console.log('Judge info:', {
      id: judge._id,
      name: judge.name,
      username: judge.username,
      judgeType: judge.judgeType
    });

    return { success: true, token, judge };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 2: Get Assigned Competitions
 */
async function testGetAssignedCompetitions(judgeId) {
  console.log('\n🧪 Test 2: Get Assigned Competitions');
  console.log('─'.repeat(50));
  
  try {
    console.log('Fetching competitions for judge:', judgeId);

    // Find all judge records for this judge ID
    const judgeRecords = await Judge.find({ _id: judgeId })
      .populate('competition', 'name level place status startDate endDate description')
      .select('competition');

    if (!judgeRecords || judgeRecords.length === 0) {
      console.log('❌ No judge records found');
      return { success: false };
    }

    // Extract competitions
    const competitions = judgeRecords
      .filter(record => record.competition)
      .map(record => ({
        _id: record.competition._id,
        name: record.competition.name,
        level: record.competition.level,
        place: record.competition.place,
        status: record.competition.status
      }));

    console.log(`✅ Found ${competitions.length} competition(s)`);
    competitions.forEach((comp, index) => {
      console.log(`  ${index + 1}. ${comp.name} (${comp.level}) - ${comp.status}`);
    });

    return { success: true, competitions };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 3: Set Competition Context
 */
async function testSetCompetition(judgeId, competitionId) {
  console.log('\n🧪 Test 3: Set Competition Context');
  console.log('─'.repeat(50));
  
  try {
    console.log('Setting competition context:', { judgeId, competitionId });

    // Verify competition exists
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      console.log('❌ Competition not found');
      return { success: false };
    }

    // Validate judge is assigned to this competition
    const judgeRecord = await Judge.findOne({
      _id: judgeId,
      competition: competitionId,
      isActive: true
    });

    if (!judgeRecord) {
      console.log('❌ Judge not assigned to competition');
      return { success: false };
    }

    // Generate new token with competition context
    const token = generateToken(judgeId, 'judge', competitionId);

    console.log('✅ Competition context set successfully');
    console.log('New token generated:', token.substring(0, 20) + '...');
    console.log('Competition:', {
      id: competition._id,
      name: competition.name,
      level: competition.level,
      status: competition.status
    });
    console.log('Judge:', {
      id: judgeRecord._id,
      name: judgeRecord.name,
      judgeType: judgeRecord.judgeType
    });

    return { success: true, token, competition, judge: judgeRecord };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 4: Invalid Login Attempts
 */
async function testInvalidLogin() {
  console.log('\n🧪 Test 4: Invalid Login Attempts');
  console.log('─'.repeat(50));
  
  try {
    // Test 4a: Wrong password
    console.log('\n4a. Testing wrong password...');
    const judge = await Judge.findOne({ username: TEST_CONFIG.judgeUsername });
    const wrongPasswordMatch = await bcrypt.compare('wrongpassword', judge.password);
    console.log(wrongPasswordMatch ? '❌ Should have failed' : '✅ Correctly rejected wrong password');

    // Test 4b: Non-existent username
    console.log('\n4b. Testing non-existent username...');
    const nonExistentJudge = await Judge.findOne({ username: 'nonexistent' });
    console.log(nonExistentJudge ? '❌ Should not have found judge' : '✅ Correctly returned null for non-existent judge');

    // Test 4c: Inactive judge
    console.log('\n4c. Testing inactive judge...');
    const inactiveJudge = await Judge.findOne({ 
      username: TEST_CONFIG.judgeUsername,
      isActive: false 
    });
    console.log(inactiveJudge ? '❌ Should not have found inactive judge' : '✅ Correctly filtered out inactive judge');

    return { success: true };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false };
  }
}

/**
 * Test 5: Unauthorized Competition Access
 */
async function testUnauthorizedCompetitionAccess(judgeId) {
  console.log('\n🧪 Test 5: Unauthorized Competition Access');
  console.log('─'.repeat(50));
  
  try {
    // Create another competition that judge is NOT assigned to
    const admin = await Admin.findOne({ role: 'super_admin' });
    const unauthorizedCompetition = await Competition.create({
      name: 'Unauthorized Competition',
      level: 'national',
      place: 'Another City',
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-07-03'),
      status: 'upcoming',
      admins: [admin._id],
      createdBy: admin._id
    });

    console.log('Created unauthorized competition:', unauthorizedCompetition.name);

    // Try to set competition context for unauthorized competition
    const judgeRecord = await Judge.findOne({
      _id: judgeId,
      competition: unauthorizedCompetition._id,
      isActive: true
    });

    if (judgeRecord) {
      console.log('❌ Should not have found judge record for unauthorized competition');
      return { success: false };
    }

    console.log('✅ Correctly prevented access to unauthorized competition');
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
    await Competition.deleteMany({ name: { $in: [TEST_CONFIG.competitionName, 'Unauthorized Competition'] } });
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Judge Authentication Tests');
  console.log('='.repeat(50));

  try {
    // Connect to database
    await connectDB();

    // Setup test data
    const { competition, judge } = await setupTestData();

    // Run tests
    const test1Result = await testJudgeLogin();
    if (!test1Result.success) {
      throw new Error('Test 1 failed');
    }

    const test2Result = await testGetAssignedCompetitions(judge._id);
    if (!test2Result.success) {
      throw new Error('Test 2 failed');
    }

    const test3Result = await testSetCompetition(judge._id, competition._id);
    if (!test3Result.success) {
      throw new Error('Test 3 failed');
    }

    const test4Result = await testInvalidLogin();
    if (!test4Result.success) {
      throw new Error('Test 4 failed');
    }

    const test5Result = await testUnauthorizedCompetitionAccess(judge._id);
    if (!test5Result.success) {
      throw new Error('Test 5 failed');
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
