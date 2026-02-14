/**
 * Test Script for Assignment Change Handling with Admin Creation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');
const { 
  recordAdminAssignmentChange, 
  isTokenInvalidated,
  clearAllAssignmentChanges 
} = require('../utils/tokenInvalidation');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mallakhamb');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function runTest() {
  console.log('\n🚀 Testing Assignment Change Handling with Admin');
  console.log('='.repeat(60));
  
  await connectDB();
  
  let testAdmin = null;
  let testCompetition = null;
  
  try {
    // Clear any existing assignment changes
    clearAllAssignmentChanges();
    
    // Create test admin
    testAdmin = await Admin.create({
      name: 'Test Security Admin',
      email: `test-security-${Date.now()}@example.com`,
      password: 'testpassword123',
      role: 'admin',
      competitions: []
    });
    console.log(`✅ Created test admin: ${testAdmin.email}`);
    
    // Create test competition
    testCompetition = await Competition.create({
      name: 'Test Security Competition ' + Date.now(),
      level: 'state',
      place: 'Test City',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      admins: [testAdmin._id]
    });
    console.log(`✅ Created test competition: ${testCompetition.name}`);
    
    // Add competition to admin
    testAdmin.competitions.push(testCompetition._id);
    await testAdmin.save();
    console.log('✅ Assigned competition to admin');
    
    // Generate initial token
    const token = generateToken(testAdmin._id, 'admin');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    
    console.log('\n📋 Token Validation Tests:');
    console.log(`   Token issued at: ${new Date(decoded.iat * 1000).toISOString()}`);
    
    // Test 1: Token should be valid initially
    const isInvalidBefore = isTokenInvalidated(testAdmin._id.toString(), decoded.iat);
    console.log(`   ✅ Token valid before change: ${!isInvalidBefore}`);
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate assignment change (admin removed from competition)
    console.log('\n🔄 Simulating assignment change...');
    recordAdminAssignmentChange(testAdmin._id);
    
    // Test 2: Token should be invalidated after change
    const isInvalidAfter = isTokenInvalidated(testAdmin._id.toString(), decoded.iat);
    console.log(`   ✅ Token invalidated after change: ${isInvalidAfter}`);
    
    // Wait a bit before generating new token
    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait more than 1 second for new iat
    
    // Generate new token after assignment change
    const newToken = generateToken(testAdmin._id, 'admin');
    const newDecoded = jwt.decode(newToken);
    console.log(`\n   New token issued at: ${new Date(newDecoded.iat * 1000).toISOString()}`);
    
    // Test 3: New token should be valid
    const isNewTokenInvalid = isTokenInvalidated(testAdmin._id.toString(), newDecoded.iat);
    console.log(`   ✅ New token is valid: ${!isNewTokenInvalid}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All assignment change tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    if (testAdmin) {
      await Admin.findByIdAndDelete(testAdmin._id);
      console.log('🗑️  Cleaned up test admin');
    }
    if (testCompetition) {
      await Competition.findByIdAndDelete(testCompetition._id);
      console.log('🗑️  Cleaned up test competition');
    }
    clearAllAssignmentChanges();
    
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

runTest().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});
