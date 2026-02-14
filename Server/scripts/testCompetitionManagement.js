/**
 * Manual Test Script for Competition Management
 * 
 * This script tests the super admin competition management endpoints:
 * - Create competition
 * - Get all competitions
 * - Get competition by ID
 * - Update competition
 * - Assign admin to competition
 * - Remove admin from competition
 * - Delete competition
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Score = require('../models/Score');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test 1: Create Competition
const testCreateCompetition = async (adminId) => {
  console.log('\n📝 Test 1: Create Competition');
  try {
    const competition = await Competition.create({
      name: 'Test State Championship 2024',
      level: 'state',
      place: 'Mumbai',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      description: 'Test competition for validation',
      status: 'upcoming',
      admins: [adminId],
      createdBy: adminId
    });

    // Update admin's competitions array
    await Admin.findByIdAndUpdate(
      adminId,
      { $addToSet: { competitions: competition._id } }
    );

    console.log('✅ Competition created:', competition.name);
    return competition;
  } catch (error) {
    console.error('❌ Create competition failed:', error.message);
    throw error;
  }
};

// Test 2: Get All Competitions
const testGetAllCompetitions = async () => {
  console.log('\n📋 Test 2: Get All Competitions');
  try {
    const competitions = await Competition.find()
      .populate('admins', 'name email')
      .populate('createdBy', 'name email');
    
    console.log(`✅ Found ${competitions.length} competition(s)`);
    competitions.forEach(comp => {
      console.log(`  - ${comp.name} (${comp.level}) - ${comp.status}`);
    });
    return competitions;
  } catch (error) {
    console.error('❌ Get all competitions failed:', error.message);
    throw error;
  }
};

// Test 3: Get Competition by ID
const testGetCompetitionById = async (competitionId) => {
  console.log('\n🔍 Test 3: Get Competition by ID');
  try {
    const competition = await Competition.findById(competitionId)
      .populate('admins', 'name email')
      .populate('createdBy', 'name email');
    
    if (!competition) {
      throw new Error('Competition not found');
    }

    // Get related entity counts
    const [teamCount, judgeCount, scoreCount] = await Promise.all([
      Team.countDocuments({ competition: competitionId }),
      Judge.countDocuments({ competition: competitionId }),
      Score.countDocuments({ competition: competitionId })
    ]);

    console.log('✅ Competition found:', competition.name);
    console.log(`  Stats: ${teamCount} teams, ${judgeCount} judges, ${scoreCount} scores`);
    return competition;
  } catch (error) {
    console.error('❌ Get competition by ID failed:', error.message);
    throw error;
  }
};

// Test 4: Update Competition
const testUpdateCompetition = async (competitionId) => {
  console.log('\n✏️  Test 4: Update Competition');
  try {
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      throw new Error('Competition not found');
    }

    competition.description = 'Updated test description';
    competition.status = 'ongoing';
    await competition.save();

    console.log('✅ Competition updated successfully');
    console.log(`  New status: ${competition.status}`);
    return competition;
  } catch (error) {
    console.error('❌ Update competition failed:', error.message);
    throw error;
  }
};

// Test 5: Search Competitions
const testSearchCompetitions = async () => {
  console.log('\n🔎 Test 5: Search Competitions');
  try {
    // Search by name
    const searchResults = await Competition.find({
      name: { $regex: 'Test', $options: 'i' }
    });
    console.log(`✅ Search by name found ${searchResults.length} result(s)`);

    // Filter by level
    const levelResults = await Competition.find({ level: 'state' });
    console.log(`✅ Filter by level found ${levelResults.length} result(s)`);

    // Filter by status
    const statusResults = await Competition.find({ status: 'ongoing' });
    console.log(`✅ Filter by status found ${statusResults.length} result(s)`);

    return { searchResults, levelResults, statusResults };
  } catch (error) {
    console.error('❌ Search competitions failed:', error.message);
    throw error;
  }
};

// Test 6: Assign Admin to Competition
const testAssignAdmin = async (competitionId, adminId) => {
  console.log('\n👤 Test 6: Assign Admin to Competition');
  try {
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      throw new Error('Competition not found');
    }

    // Check if admin already assigned
    if (competition.admins.some(a => a.toString() === adminId.toString())) {
      console.log('ℹ️  Admin already assigned to this competition');
      return competition;
    }

    await competition.addAdmin(adminId);

    // Add competition to admin's competitions array
    await Admin.findByIdAndUpdate(
      adminId,
      { $addToSet: { competitions: competitionId } }
    );

    console.log('✅ Admin assigned to competition successfully');
    return competition;
  } catch (error) {
    console.error('❌ Assign admin failed:', error.message);
    throw error;
  }
};

// Test 7: Remove Admin from Competition
const testRemoveAdmin = async (competitionId, adminId) => {
  console.log('\n👤 Test 7: Remove Admin from Competition');
  try {
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      throw new Error('Competition not found');
    }

    // Prevent removing the last admin
    if (competition.admins.length === 1) {
      console.log('ℹ️  Cannot remove the last admin from competition');
      return competition;
    }

    await competition.removeAdmin(adminId);

    // Remove competition from admin's competitions array
    await Admin.findByIdAndUpdate(
      adminId,
      { $pull: { competitions: competitionId } }
    );

    console.log('✅ Admin removed from competition successfully');
    return competition;
  } catch (error) {
    console.error('❌ Remove admin failed:', error.message);
    throw error;
  }
};

// Test 8: Delete Competition
const testDeleteCompetition = async (competitionId) => {
  console.log('\n🗑️  Test 8: Delete Competition');
  try {
    // Check for related entities
    const [teamCount, judgeCount, scoreCount] = await Promise.all([
      Team.countDocuments({ competition: competitionId }),
      Judge.countDocuments({ competition: competitionId }),
      Score.countDocuments({ competition: competitionId })
    ]);

    const hasRelatedData = teamCount > 0 || judgeCount > 0 || scoreCount > 0;

    if (hasRelatedData) {
      console.log('ℹ️  Competition has related data:');
      console.log(`  - ${teamCount} teams`);
      console.log(`  - ${judgeCount} judges`);
      console.log(`  - ${scoreCount} scores`);
      console.log('  Cannot delete competition with related data');
      return null;
    }

    // Remove competition from all admins
    await Admin.updateMany(
      { competitions: competitionId },
      { $pull: { competitions: competitionId } }
    );

    // Delete competition
    await Competition.findByIdAndDelete(competitionId);

    console.log('✅ Competition deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Delete competition failed:', error.message);
    throw error;
  }
};

// Main test runner
const runTests = async () => {
  console.log('🚀 Starting Competition Management Tests\n');
  console.log('='.repeat(50));

  try {
    await connectDB();

    // Find or create a test admin
    let admin = await Admin.findOne({ role: 'super_admin' });
    if (!admin) {
      console.log('⚠️  No super admin found. Please create one first.');
      process.exit(1);
    }
    console.log(`✅ Using admin: ${admin.name} (${admin.email})`);

    // Run tests
    const competition = await testCreateCompetition(admin._id);
    await testGetAllCompetitions();
    await testGetCompetitionById(competition._id);
    await testUpdateCompetition(competition._id);
    await testSearchCompetitions();
    
    // Test admin assignment (if there's another admin)
    const anotherAdmin = await Admin.findOne({ 
      _id: { $ne: admin._id },
      role: 'admin'
    });
    if (anotherAdmin) {
      await testAssignAdmin(competition._id, anotherAdmin._id);
      await testRemoveAdmin(competition._id, anotherAdmin._id);
    }

    await testDeleteCompetition(competition._id);

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
};

// Run tests
runTests();
