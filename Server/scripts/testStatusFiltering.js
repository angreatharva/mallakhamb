const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
require('dotenv').config();

async function testStatusFiltering() {
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

    // Create competitions with different statuses
    console.log('\n=== Creating Test Competitions ===');
    
    const upcomingComp = new Competition({
      name: 'Upcoming Competition Filter Test',
      level: 'state',
      place: 'Test City',
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      admins: [testAdmin._id]
    });
    upcomingComp.setInitialStatus();
    await upcomingComp.save();
    console.log(`✅ Created upcoming competition: ${upcomingComp.status}`);

    const ongoingComp = new Competition({
      name: 'Ongoing Competition Filter Test',
      level: 'national',
      place: 'Test City',
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      admins: [testAdmin._id]
    });
    ongoingComp.setInitialStatus();
    await ongoingComp.save();
    console.log(`✅ Created ongoing competition: ${ongoingComp.status}`);

    const completedComp = new Competition({
      name: 'Completed Competition Filter Test',
      level: 'international',
      place: 'Test City',
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      admins: [testAdmin._id]
    });
    completedComp.setInitialStatus();
    await completedComp.save();
    console.log(`✅ Created completed competition: ${completedComp.status}`);

    // Test filtering by status
    console.log('\n=== Test 1: Filter by status = upcoming ===');
    const upcomingResults = await Competition.find({ 
      status: 'upcoming',
      name: /Filter Test/
    });
    console.log(`Found ${upcomingResults.length} upcoming competition(s)`);
    console.log(upcomingResults.length === 1 && upcomingResults[0].status === 'upcoming' 
      ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 2: Filter by status = ongoing ===');
    const ongoingResults = await Competition.find({ 
      status: 'ongoing',
      name: /Filter Test/
    });
    console.log(`Found ${ongoingResults.length} ongoing competition(s)`);
    console.log(ongoingResults.length === 1 && ongoingResults[0].status === 'ongoing' 
      ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 3: Filter by status = completed ===');
    const completedResults = await Competition.find({ 
      status: 'completed',
      name: /Filter Test/
    });
    console.log(`Found ${completedResults.length} completed competition(s)`);
    console.log(completedResults.length === 1 && completedResults[0].status === 'completed' 
      ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 4: No status filter (get all) ===');
    const allResults = await Competition.find({ 
      name: /Filter Test/
    });
    console.log(`Found ${allResults.length} total competition(s)`);
    console.log(allResults.length === 3 ? '✅ PASS' : '❌ FAIL');

    console.log('\n=== Test 5: Combined filters (status + level) ===');
    const combinedResults = await Competition.find({ 
      status: 'ongoing',
      level: 'national',
      name: /Filter Test/
    });
    console.log(`Found ${combinedResults.length} ongoing national competition(s)`);
    console.log(combinedResults.length === 1 && 
                combinedResults[0].status === 'ongoing' && 
                combinedResults[0].level === 'national' 
      ? '✅ PASS' : '❌ FAIL');

    // Cleanup
    console.log('\n=== Cleanup ===');
    await Competition.deleteMany({ 
      name: /Filter Test/
    });
    console.log('✅ Test competitions deleted');

    console.log('\n=== All Tests Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testStatusFiltering();
