const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
require('dotenv').config();

async function testCompetitionStatus() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find or create a test admin
    let testAdmin = await Admin.findOne({ email: 'test@admin.com' });
    if (!testAdmin) {
      testAdmin = await Admin.create({
        name: 'Test Admin',
        email: 'test@admin.com',
        password: 'test123',
        role: 'admin'
      });
      console.log('✅ Created test admin');
    }

    console.log('\n=== Test 1: setInitialStatus() - Upcoming Competition ===');
    const upcomingComp = new Competition({
      name: 'Future Competition Test',
      level: 'state',
      place: 'Test City',
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
      admins: [testAdmin._id]
    });
    upcomingComp.setInitialStatus();
    await upcomingComp.save();
    console.log(`Status: ${upcomingComp.status} (Expected: upcoming)`);
    console.log(upcomingComp.status === 'upcoming' ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 2: setInitialStatus() - Ongoing Competition ===');
    const ongoingComp = new Competition({
      name: 'Current Competition Test',
      level: 'national',
      place: 'Test City',
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      admins: [testAdmin._id]
    });
    ongoingComp.setInitialStatus();
    await ongoingComp.save();
    console.log(`Status: ${ongoingComp.status} (Expected: ongoing)`);
    console.log(ongoingComp.status === 'ongoing' ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 3: setInitialStatus() - Completed Competition ===');
    const completedComp = new Competition({
      name: 'Past Competition Test',
      level: 'international',
      place: 'Test City',
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      admins: [testAdmin._id]
    });
    completedComp.setInitialStatus();
    await completedComp.save();
    console.log(`Status: ${completedComp.status} (Expected: completed)`);
    console.log(completedComp.status === 'completed' ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 4: updateCompetitionStatus() - Valid Transition ===');
    try {
      await ongoingComp.updateCompetitionStatus('ongoing');
      console.log('✅ PASS - Allowed valid status transition');
    } catch (error) {
      console.log('❌ FAIL - Should allow valid transition:', error.message);
    }

    console.log('\n=== Test 5: updateCompetitionStatus() - Invalid Transition (ongoing before start) ===');
    try {
      await upcomingComp.updateCompetitionStatus('ongoing');
      console.log('❌ FAIL - Should reject ongoing status before start date');
    } catch (error) {
      console.log('✅ PASS - Correctly rejected:', error.message);
    }

    console.log('\n=== Test 6: updateCompetitionStatus() - Invalid Transition (completed before end) ===');
    try {
      await ongoingComp.updateCompetitionStatus('completed');
      console.log('❌ FAIL - Should reject completed status before end date');
    } catch (error) {
      console.log('✅ PASS - Correctly rejected:', error.message);
    }

    console.log('\n=== Test 7: updateCompetitionStatus() - Valid Completed Transition ===');
    try {
      await completedComp.updateCompetitionStatus('completed');
      console.log('✅ PASS - Allowed valid completed status');
    } catch (error) {
      console.log('❌ FAIL - Should allow completed status:', error.message);
    }

    // Cleanup
    console.log('\n=== Cleanup ===');
    await Competition.deleteMany({ 
      name: { $in: ['Future Competition Test', 'Current Competition Test', 'Past Competition Test'] } 
    });
    console.log('✅ Test competitions deleted');

    console.log('\n=== All Tests Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testCompetitionStatus();
