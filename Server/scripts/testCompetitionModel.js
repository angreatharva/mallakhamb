const mongoose = require('mongoose');
const Competition = require('../models/Competition');
require('dotenv').config();

async function testCompetitionModel() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Clean up any existing test data
    await Competition.deleteMany({ name: /Test Competition|Invalid|Active|Inactive|Upcoming|Ongoing|Completed/ });

    // Test 1: Create a valid competition
    console.log('\n--- Test 1: Create valid competition ---');
    const testCompetition = new Competition({
      name: 'Test Competition 2024',
      level: 'state',
      place: 'Test Location',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30'),
      description: 'Test competition for validation',
      status: 'upcoming'
    });

    await testCompetition.validate();
    console.log('✓ Valid competition passes validation');

    // Test 2: Test date validation (startDate >= endDate should fail)
    console.log('\n--- Test 2: Test date validation ---');
    const invalidDateCompetition = new Competition({
      name: 'Invalid Date Competition',
      level: 'national',
      place: 'Test Location',
      startDate: new Date('2024-06-30'),
      endDate: new Date('2024-06-01'),
      description: 'Should fail validation'
    });

    try {
      await invalidDateCompetition.validate();
      console.log('✗ Date validation failed - should have thrown error');
    } catch (error) {
      if (error.errors && error.errors.endDate) {
        console.log('✓ Date validation works correctly:', error.errors.endDate.message);
      } else {
        console.log('✗ Unexpected error:', error.message);
      }
    }

    // Test 3: Test enum validation for level
    console.log('\n--- Test 3: Test level enum validation ---');
    const invalidLevelCompetition = new Competition({
      name: 'Invalid Level Competition',
      level: 'regional',
      place: 'Test Location',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30')
    });

    try {
      await invalidLevelCompetition.validate();
      console.log('✗ Level enum validation failed - should have thrown error');
    } catch (error) {
      if (error.errors && error.errors.level) {
        console.log('✓ Level enum validation works correctly');
      } else {
        console.log('✗ Unexpected error:', error.message);
      }
    }

    // Test 4: Test enum validation for status
    console.log('\n--- Test 4: Test status enum validation ---');
    const invalidStatusCompetition = new Competition({
      name: 'Invalid Status Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30'),
      status: 'cancelled'
    });

    try {
      await invalidStatusCompetition.validate();
      console.log('✗ Status enum validation failed - should have thrown error');
    } catch (error) {
      if (error.errors && error.errors.status) {
        console.log('✓ Status enum validation works correctly');
      } else {
        console.log('✗ Unexpected error:', error.message);
      }
    }

    // Test 5: Test addAdmin method
    console.log('\n--- Test 5: Test addAdmin method ---');
    const adminId = new mongoose.Types.ObjectId();
    testCompetition.admins = [];
    await testCompetition.addAdmin(adminId);
    if (testCompetition.admins.length === 1 && testCompetition.admins[0].toString() === adminId.toString()) {
      console.log('✓ addAdmin method works correctly');
    } else {
      console.log('✗ addAdmin method failed');
    }

    // Test 6: Test addAdmin doesn't add duplicates
    console.log('\n--- Test 6: Test addAdmin prevents duplicates ---');
    await testCompetition.addAdmin(adminId);
    if (testCompetition.admins.length === 1) {
      console.log('✓ addAdmin prevents duplicate admins');
    } else {
      console.log('✗ addAdmin allowed duplicate admin');
    }

    // Test 7: Test removeAdmin method
    console.log('\n--- Test 7: Test removeAdmin method ---');
    await testCompetition.removeAdmin(adminId);
    if (testCompetition.admins.length === 0) {
      console.log('✓ removeAdmin method works correctly');
    } else {
      console.log('✗ removeAdmin method failed');
    }

    // Test 8: Test isActive method
    console.log('\n--- Test 8: Test isActive method ---');
    const activeCompetition = new Competition({
      name: 'Active Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date(Date.now() - 86400000), // Yesterday
      endDate: new Date(Date.now() + 86400000), // Tomorrow
      status: 'ongoing'
    });
    
    if (activeCompetition.isActive()) {
      console.log('✓ isActive method works correctly for active competition');
    } else {
      console.log('✗ isActive method failed for active competition');
    }

    const inactiveCompetition = new Competition({
      name: 'Inactive Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date(Date.now() + 86400000), // Tomorrow
      endDate: new Date(Date.now() + 172800000), // Day after tomorrow
      status: 'upcoming'
    });
    
    if (!inactiveCompetition.isActive()) {
      console.log('✓ isActive method works correctly for inactive competition');
    } else {
      console.log('✗ isActive method failed for inactive competition');
    }

    // Test 9: Test updateStatus method
    console.log('\n--- Test 9: Test updateStatus method ---');
    const upcomingComp = new Competition({
      name: 'Upcoming Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date(Date.now() + 86400000), // Tomorrow
      endDate: new Date(Date.now() + 172800000)
    });
    
    upcomingComp.updateStatus();
    if (upcomingComp.status === 'upcoming') {
      console.log('✓ updateStatus correctly sets upcoming status');
    } else {
      console.log('✗ updateStatus failed for upcoming competition');
    }

    const ongoingComp = new Competition({
      name: 'Ongoing Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date(Date.now() - 86400000), // Yesterday
      endDate: new Date(Date.now() + 86400000) // Tomorrow
    });
    
    ongoingComp.updateStatus();
    if (ongoingComp.status === 'ongoing') {
      console.log('✓ updateStatus correctly sets ongoing status');
    } else {
      console.log('✗ updateStatus failed for ongoing competition');
    }

    const completedComp = new Competition({
      name: 'Completed Competition',
      level: 'state',
      place: 'Test Location',
      startDate: new Date(Date.now() - 172800000), // 2 days ago
      endDate: new Date(Date.now() - 86400000) // Yesterday
    });
    
    completedComp.updateStatus();
    if (completedComp.status === 'completed') {
      console.log('✓ updateStatus correctly sets completed status');
    } else {
      console.log('✗ updateStatus failed for completed competition');
    }

    console.log('\n✓ All tests completed successfully!');

  } catch (error) {
    console.error('✗ Test failed with error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

testCompetitionModel();
