const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Competition = require('./models/Competition');
const Score = require('./models/Score');
const Judge = require('./models/Judge');

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

const testAPIFixes = async () => {
  await connectDB();
  
  try {
    console.log('\n=== Testing API Fixes ===\n');
    
    // Get a sample competition ID
    const competition = await Competition.findOne().lean();
    if (!competition) {
      console.log('No competitions found in database');
      return;
    }
    
    console.log(`Testing with competition: ${competition.name} (ID: ${competition._id})`);
    
    // Test 1: Check submitted teams
    console.log('\n1. Testing submitted teams...');
    console.log(`Competition has ${competition.registeredTeams?.length || 0} registered teams`);
    
    const submittedTeams = competition.registeredTeams?.filter(team => team.isSubmitted) || [];
    console.log(`Found ${submittedTeams.length} submitted teams`);
    
    if (submittedTeams.length > 0) {
      console.log('Sample submitted team:', {
        teamId: submittedTeams[0].team,
        isSubmitted: submittedTeams[0].isSubmitted,
        playersCount: submittedTeams[0].players?.length || 0,
        paymentStatus: submittedTeams[0].paymentStatus
      });
    }
    
    // Test 2: Check judges
    console.log('\n2. Testing judges...');
    const judgeCount = await Judge.countDocuments({ competition: competition._id });
    console.log(`Found ${judgeCount} judges for this competition`);
    
    // Test 3: Check scores
    console.log('\n3. Testing scores...');
    const scoreCount = await Score.countDocuments({ competition: competition._id });
    console.log(`Found ${scoreCount} score records for this competition`);
    
    if (scoreCount > 0) {
      const sampleScore = await Score.findOne({ competition: competition._id }).lean();
      console.log('Sample score record:', {
        ageGroup: sampleScore.ageGroup,
        playerScoresCount: sampleScore.playerScores?.length || 0,
        team: sampleScore.team
      });
    }
    
    // Test 4: Check age groups and genders in registered teams
    console.log('\n4. Testing filters...');
    const ageGroups = new Set();
    const genders = new Set();
    
    competition.registeredTeams?.forEach(regTeam => {
      regTeam.players?.forEach(playerEntry => {
        if (playerEntry.ageGroup) ageGroups.add(playerEntry.ageGroup);
        if (playerEntry.gender) genders.add(playerEntry.gender);
      });
    });
    
    console.log('Available age groups:', Array.from(ageGroups));
    console.log('Available genders:', Array.from(genders));
    
    // Test with specific filters
    const maleAbove18Teams = competition.registeredTeams?.filter(regTeam => {
      return regTeam.isSubmitted && regTeam.players?.some(playerEntry => 
        playerEntry.gender === 'Male' && playerEntry.ageGroup === 'Above18'
      );
    }) || [];
    
    console.log(`Teams with Male Above18 players: ${maleAbove18Teams.length}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed');
  }
};

testAPIFixes();