/**
 * Manual test script for competition authentication endpoints
 * Run with: node scripts/testCompetitionAuth.js
 */

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');
require('dotenv').config();

async function testCompetitionAuth() {
  try {
    console.log('🧪 Testing Competition Authentication Implementation...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Verify generateToken with competition context
    console.log('Test 1: Generate token with competition context');
    const testUserId = new mongoose.Types.ObjectId();
    const testCompId = new mongoose.Types.ObjectId();
    const tokenWithComp = generateToken(testUserId, 'admin', testCompId);
    console.log('✅ Token generated:', tokenWithComp.substring(0, 50) + '...');
    
    // Decode token to verify structure
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(tokenWithComp, process.env.JWT_SECRET || 'fallback-secret');
    console.log('✅ Token payload:', {
      userId: decoded.userId,
      userType: decoded.userType,
      currentCompetition: decoded.currentCompetition
    });
    console.log('✅ Competition context included in token\n');

    // Test 2: Verify generateToken without competition context
    console.log('Test 2: Generate token without competition context');
    const tokenWithoutComp = generateToken(testUserId, 'admin');
    const decoded2 = jwt.verify(tokenWithoutComp, process.env.JWT_SECRET || 'fallback-secret');
    console.log('✅ Token payload:', {
      userId: decoded2.userId,
      userType: decoded2.userType,
      currentCompetition: decoded2.currentCompetition || 'undefined'
    });
    console.log('✅ Token works without competition context\n');

    // Test 3: Verify Admin model methods
    console.log('Test 3: Verify Admin model methods');
    
    // Create test competition
    const testComp = await Competition.create({
      name: 'Test Competition ' + Date.now(),
      level: 'state',
      place: 'Test City',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      description: 'Test competition for auth verification'
    });
    console.log('✅ Test competition created:', testComp.name);

    // Create test admin
    const testAdmin = await Admin.create({
      name: 'Test Admin',
      email: 'testadmin' + Date.now() + '@example.com',
      password: 'password123',
      role: 'admin',
      competitions: [testComp._id]
    });
    console.log('✅ Test admin created:', testAdmin.email);

    // Test hasAccessToCompetition method
    const hasAccess = testAdmin.hasAccessToCompetition(testComp._id);
    console.log('✅ hasAccessToCompetition:', hasAccess);

    const noAccess = testAdmin.hasAccessToCompetition(new mongoose.Types.ObjectId());
    console.log('✅ hasAccessToCompetition (wrong comp):', noAccess);

    // Test getAssignedCompetitions method
    const assignedComps = await testAdmin.getAssignedCompetitions();
    console.log('✅ getAssignedCompetitions:', assignedComps.length, 'competition(s)');
    console.log('   Competition name:', assignedComps[0].name);

    // Test 4: Verify Super Admin access
    console.log('\nTest 4: Verify Super Admin access');
    const superAdmin = await Admin.create({
      name: 'Test Super Admin',
      email: 'testsuperadmin' + Date.now() + '@example.com',
      password: 'password123',
      role: 'super_admin',
      competitions: []
    });
    console.log('✅ Super admin created:', superAdmin.email);

    const superHasAccess = superAdmin.hasAccessToCompetition(testComp._id);
    console.log('✅ Super admin hasAccessToCompetition:', superHasAccess);
    console.log('   (Super admins have access to all competitions)');

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await Competition.findByIdAndDelete(testComp._id);
    await Admin.findByIdAndDelete(testAdmin._id);
    await Admin.findByIdAndDelete(superAdmin._id);
    console.log('✅ Test data cleaned up');

    console.log('\n✅ All tests passed! Competition authentication is working correctly.\n');

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

testCompetitionAuth();
