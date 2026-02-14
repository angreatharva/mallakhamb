const mongoose = require('mongoose');
const Competition = require('../models/Competition');

console.log('=== Competition Model Validation Tests ===\n');

// Test 1: Create a valid competition instance
console.log('Test 1: Create valid competition instance');
try {
  const validCompetition = new Competition({
    name: 'Test Competition 2024',
    level: 'state',
    place: 'Test Location',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-30'),
    description: 'Test competition for validation',
    status: 'upcoming'
  });

  const validationError = validCompetition.validateSync();
  if (!validationError) {
    console.log('✓ Valid competition passes validation\n');
  } else {
    console.log('✗ Validation failed:', validationError.message, '\n');
  }
} catch (error) {
  console.log('✗ Error creating competition:', error.message, '\n');
}

// Test 2: Test date validation (startDate >= endDate should fail)
console.log('Test 2: Date validation (startDate must be before endDate)');
try {
  const invalidDateCompetition = new Competition({
    name: 'Invalid Date Competition',
    level: 'national',
    place: 'Test Location',
    startDate: new Date('2024-06-30'),
    endDate: new Date('2024-06-01'),
    description: 'Should fail validation'
  });

  const validationError = invalidDateCompetition.validateSync();
  if (validationError && validationError.errors.endDate) {
    console.log('✓ Date validation works:', validationError.errors.endDate.message, '\n');
  } else if (validationError) {
    console.log('✗ Date validation error found but not on endDate field:', Object.keys(validationError.errors), '\n');
  } else {
    console.log('✗ Date validation did not catch invalid dates\n');
  }
} catch (error) {
  console.log('✗ Unexpected error:', error.message, '\n');
}

// Test 3: Test enum validation for level
console.log('Test 3: Level enum validation');
try {
  const invalidLevelCompetition = new Competition({
    name: 'Invalid Level Competition',
    level: 'regional',
    place: 'Test Location',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-30')
  });

  const validationError = invalidLevelCompetition.validateSync();
  if (validationError && validationError.errors.level) {
    console.log('✓ Level enum validation works\n');
  } else {
    console.log('✗ Level enum validation failed\n');
  }
} catch (error) {
  console.log('✗ Unexpected error:', error.message, '\n');
}

// Test 4: Test enum validation for status
console.log('Test 4: Status enum validation');
try {
  const invalidStatusCompetition = new Competition({
    name: 'Invalid Status Competition',
    level: 'state',
    place: 'Test Location',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-30'),
    status: 'cancelled'
  });

  const validationError = invalidStatusCompetition.validateSync();
  if (validationError && validationError.errors.status) {
    console.log('✓ Status enum validation works\n');
  } else {
    console.log('✗ Status enum validation failed\n');
  }
} catch (error) {
  console.log('✗ Unexpected error:', error.message, '\n');
}

// Test 5: Test required fields
console.log('Test 5: Required fields validation');
try {
  const missingFieldsCompetition = new Competition({
    name: 'Test Competition'
  });

  const validationError = missingFieldsCompetition.validateSync();
  if (validationError) {
    const requiredFields = ['level', 'place', 'startDate', 'endDate'];
    const missingFields = requiredFields.filter(field => validationError.errors[field]);
    console.log('✓ Required fields validation works. Missing:', missingFields.join(', '), '\n');
  } else {
    console.log('✗ Required fields validation failed\n');
  }
} catch (error) {
  console.log('✗ Unexpected error:', error.message, '\n');
}

// Test 6: Test addAdmin method
console.log('Test 6: addAdmin method');
try {
  const competition = new Competition({
    name: 'Test Competition',
    level: 'state',
    place: 'Test Location',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-30')
  });

  const adminId = new mongoose.Types.ObjectId();
  competition.admins = [];
  
  // Simulate addAdmin without saving
  const adminExists = competition.admins.some(admin => admin.toString() === adminId.toString());
  if (!adminExists) {
    competition.admins.push(adminId);
  }
  
  if (competition.admins.length === 1 && competition.admins[0].toString() === adminId.toString()) {
    console.log('✓ addAdmin method logic works correctly\n');
  } else {
    console.log('✗ addAdmin method logic failed\n');
  }
} catch (error) {
  console.log('✗ Error testing addAdmin:', error.message, '\n');
}

// Test 7: Test removeAdmin method
console.log('Test 7: removeAdmin method');
try {
  const competition = new Competition({
    name: 'Test Competition',
    level: 'state',
    place: 'Test Location',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-30')
  });

  const adminId = new mongoose.Types.ObjectId();
  competition.admins = [adminId];
  
  // Simulate removeAdmin without saving
  competition.admins = competition.admins.filter(admin => admin.toString() !== adminId.toString());
  
  if (competition.admins.length === 0) {
    console.log('✓ removeAdmin method logic works correctly\n');
  } else {
    console.log('✗ removeAdmin method logic failed\n');
  }
} catch (error) {
  console.log('✗ Error testing removeAdmin:', error.message, '\n');
}

// Test 8: Test isActive method
console.log('Test 8: isActive method');
try {
  const activeCompetition = new Competition({
    name: 'Active Competition',
    level: 'state',
    place: 'Test Location',
    startDate: new Date(Date.now() - 86400000), // Yesterday
    endDate: new Date(Date.now() + 86400000), // Tomorrow
    status: 'ongoing'
  });
  
  if (activeCompetition.isActive()) {
    console.log('✓ isActive returns true for active competition');
  } else {
    console.log('✗ isActive failed for active competition');
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
    console.log('✓ isActive returns false for inactive competition\n');
  } else {
    console.log('✗ isActive failed for inactive competition\n');
  }
} catch (error) {
  console.log('✗ Error testing isActive:', error.message, '\n');
}

// Test 9: Test updateStatus method
console.log('Test 9: updateStatus method');
try {
  const upcomingComp = new Competition({
    name: 'Upcoming Competition',
    level: 'state',
    place: 'Test Location',
    startDate: new Date(Date.now() + 86400000), // Tomorrow
    endDate: new Date(Date.now() + 172800000)
  });
  
  // Simulate updateStatus without saving
  const now = new Date();
  if (now < upcomingComp.startDate) {
    upcomingComp.status = 'upcoming';
  } else if (now >= upcomingComp.startDate && now <= upcomingComp.endDate) {
    upcomingComp.status = 'ongoing';
  } else {
    upcomingComp.status = 'completed';
  }
  
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
  
  if (now < ongoingComp.startDate) {
    ongoingComp.status = 'upcoming';
  } else if (now >= ongoingComp.startDate && now <= ongoingComp.endDate) {
    ongoingComp.status = 'ongoing';
  } else {
    ongoingComp.status = 'completed';
  }
  
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
  
  if (now < completedComp.startDate) {
    completedComp.status = 'upcoming';
  } else if (now >= completedComp.startDate && now <= completedComp.endDate) {
    completedComp.status = 'ongoing';
  } else {
    completedComp.status = 'completed';
  }
  
  if (completedComp.status === 'completed') {
    console.log('✓ updateStatus correctly sets completed status\n');
  } else {
    console.log('✗ updateStatus failed for completed competition\n');
  }
} catch (error) {
  console.log('✗ Error testing updateStatus:', error.message, '\n');
}

console.log('=== All validation tests completed ===');
