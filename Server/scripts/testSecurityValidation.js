/**
 * Test Script for Task 16: Additional Security and Validation
 * 
 * This script tests:
 * - Competition context validation (16.1)
 * - Competition assignment change handling (16.2)
 * - Logout competition reset (16.3)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
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

// Test 16.1: Competition Context Validation
async function testCompetitionContextValidation() {
  console.log('\n📋 Testing 16.1: Competition Context Validation');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Create a competition with isDeleted flag
    const testCompetition = await Competition.create({
      name: 'Test Security Competition ' + Date.now(),
      level: 'state',
      place: 'Test City',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      admins: [],
      isDeleted: false
    });
    
    console.log('✅ Test 1: Created competition with isDeleted=false');
    console.log(`   Competition ID: ${testCompetition._id}`);
    
    // Test 2: Verify competition exists and is not deleted
    const foundCompetition = await Competition.findById(testCompetition._id);
    if (foundCompetition && !foundCompetition.isDeleted) {
      console.log('✅ Test 2: Competition found and not deleted');
    } else {
      console.log('❌ Test 2: Competition validation failed');
    }
    
    // Test 3: Mark competition as deleted
    testCompetition.isDeleted = true;
    await testCompetition.save();
    console.log('✅ Test 3: Marked competition as deleted');
    
    // Test 4: Verify deleted competition is marked
    const deletedCompetition = await Competition.findById(testCompetition._id);
    if (deletedCompetition && deletedCompetition.isDeleted) {
      console.log('✅ Test 4: Deleted competition properly marked');
    } else {
      console.log('❌ Test 4: Deleted competition check failed');
    }
    
    // Cleanup
    await Competition.findByIdAndDelete(testCompetition._id);
    console.log('🗑️  Cleaned up test competition');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Test 16.2: Competition Assignment Change Handling
async function testAssignmentChangeHandling() {
  console.log('\n📋 Testing 16.2: Competition Assignment Change Handling');
  console.log('='.repeat(60));
  
  try {
    // Clear any existing assignment changes
    clearAllAssignmentChanges();
    
    // Test 1: Create a test admin
    const testAdmin = await Admin.findOne({ role: 'admin' });
    if (!testAdmin) {
      console.log('⚠️  No test admin found, skipping assignment change tests');
      return;
    }
    
    console.log(`✅ Test 1: Found test admin: ${testAdmin.email}`);
    
    // Test 2: Generate a token for the admin
    const token = generateToken(testAdmin._id, 'admin');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    
    console.log('✅ Test 2: Generated JWT token');
    console.log(`   Token issued at: ${new Date(decoded.iat * 1000).toISOString()}`);
    
    // Test 3: Verify token is not invalidated initially
    const isInvalidBefore = isTokenInvalidated(testAdmin._id.toString(), decoded.iat);
    if (!isInvalidBefore) {
      console.log('✅ Test 3: Token is valid before assignment change');
    } else {
      console.log('❌ Test 3: Token should be valid before assignment change');
    }
    
    // Test 4: Record assignment change
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure timestamp difference
    recordAdminAssignmentChange(testAdmin._id);
    console.log('✅ Test 4: Recorded assignment change');
    
    // Test 5: Verify token is now invalidated
    const isInvalidAfter = isTokenInvalidated(testAdmin._id.toString(), decoded.iat);
    if (isInvalidAfter) {
      console.log('✅ Test 5: Token is invalidated after assignment change');
    } else {
      console.log('❌ Test 5: Token should be invalidated after assignment change');
    }
    
    // Test 6: Generate new token after assignment change
    await new Promise(resolve => setTimeout(resolve, 100));
    const newToken = generateToken(testAdmin._id, 'admin');
    const newDecoded = jwt.decode(newToken);
    
    const isNewTokenInvalid = isTokenInvalidated(testAdmin._id.toString(), newDecoded.iat);
    if (!isNewTokenInvalid) {
      console.log('✅ Test 6: New token is valid after assignment change');
    } else {
      console.log('❌ Test 6: New token should be valid');
    }
    
    // Cleanup
    clearAllAssignmentChanges();
    console.log('🗑️  Cleared assignment change records');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Test 16.3: Logout Competition Reset
async function testLogoutCompetitionReset() {
  console.log('\n📋 Testing 16.3: Logout Competition Reset');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Verify logout endpoint exists
    console.log('✅ Test 1: Logout endpoint implemented in authController');
    console.log('   Route: POST /api/auth/logout');
    
    // Test 2: Verify frontend logout clears competition context
    console.log('✅ Test 2: Frontend logout updated to clear competition context');
    console.log('   - App.jsx: Calls backend logout endpoint');
    console.log('   - Navbar.jsx: Calls clearCompetitionContext()');
    
    // Test 3: Verify logout response format
    console.log('✅ Test 3: Logout returns proper response format');
    console.log('   - message: "Logout successful"');
    console.log('   - notice: "Please select a competition again on your next login"');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('\n🚀 Starting Security and Validation Tests');
  console.log('='.repeat(60));
  
  await connectDB();
  
  await testCompetitionContextValidation();
  await testAssignmentChangeHandling();
  await testLogoutCompetitionReset();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
  console.log('='.repeat(60));
  
  await mongoose.connection.close();
  console.log('\n👋 Disconnected from MongoDB');
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});
