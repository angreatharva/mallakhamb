const mongoose = require('mongoose');
require('dotenv').config();

// Import the DI container and services
const createContainer = require('./src/infrastructure/di-container');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const testEndpoints = async () => {
  await connectDB();
  
  try {
    console.log('\n=== Testing API Endpoints ===\n');
    
    // Initialize DI container
    const container = createContainer();
    const adminService = container.resolve('adminService');
    
    // Get a sample competition ID
    const Competition = require('./models/Competition');
    const competition = await Competition.findOne().lean();
    const competitionId = competition._id.toString();
    
    console.log(`Testing with competition: ${competition.name}`);
    console.log(`Competition ID: ${competitionId}\n`);
    
    // Test 1: getSubmittedTeams
    console.log('1. Testing getSubmittedTeams...');
    try {
      const submittedTeams = await adminService.getSubmittedTeams(competitionId, {
        gender: 'Male',
        ageGroup: 'Above18'
      });
      console.log(`✅ Found ${submittedTeams.length} submitted teams`);
      if (submittedTeams.length > 0) {
        console.log('   Sample team:', submittedTeams[0].name);
        console.log('   Players count:', submittedTeams[0].players?.length || 0);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    // Test 2: getAllJudgesSummary
    console.log('\n2. Testing getAllJudgesSummary...');
    try {
      const judgesSummary = await adminService.getAllJudgesSummary(competitionId);
      console.log(`✅ Found ${judgesSummary.totalJudges} total judges`);
      console.log(`   Active judges: ${judgesSummary.activeJudges}`);
      console.log(`   Summary entries: ${judgesSummary.summary?.length || 0}`);
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    // Test 3: getIndividualScores
    console.log('\n3. Testing getIndividualScores...');
    try {
      const individualScores = await adminService.getIndividualScores(competitionId, 'Above18', 'Male');
      console.log(`✅ Found ${individualScores.length} individual scores`);
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    // Test 4: getTeamRankings
    console.log('\n4. Testing getTeamRankings...');
    try {
      const teamRankings = await adminService.getTeamRankings(competitionId, 'Above18', 'Male');
      console.log(`✅ Found ${teamRankings.length} team rankings`);
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    console.log(`\n=== Test URLs ===`);
    console.log(`Use this competition ID in your frontend: ${competitionId}`);
    console.log(`Test URL: http://localhost:5000/api/superadmin/submitted-teams?gender=Male&ageGroup=Above18&competition=${competitionId}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed');
  }
};

testEndpoints();