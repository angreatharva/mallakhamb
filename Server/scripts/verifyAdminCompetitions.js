/**
 * Verify Admin Competitions
 * 
 * This script verifies that admins have their competitions properly assigned
 */

require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');

async function verifyAdminCompetitions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get all admins
    const admins = await Admin.find({}).populate('competitions');
    
    console.log('='.repeat(60));
    console.log('ADMIN COMPETITIONS VERIFICATION');
    console.log('='.repeat(60));
    
    for (const admin of admins) {
      console.log(`\nAdmin: ${admin.name} (${admin.email})`);
      console.log(`Role: ${admin.role}`);
      console.log(`Competitions assigned: ${admin.competitions.length}`);
      
      if (admin.competitions.length > 0) {
        admin.competitions.forEach((comp, index) => {
          console.log(`  ${index + 1}. ${comp.name} (${comp._id})`);
        });
      } else {
        console.log('  No competitions assigned');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Also check competitions and their admins
    const competitions = await Competition.find({ isDeleted: false }).populate('admins');
    
    console.log('\nCOMPETITION ADMINS VERIFICATION');
    console.log('='.repeat(60));
    
    for (const comp of competitions) {
      console.log(`\nCompetition: ${comp.name}`);
      console.log(`Admins assigned: ${comp.admins.length}`);
      
      if (comp.admins.length > 0) {
        comp.admins.forEach((admin, index) => {
          console.log(`  ${index + 1}. ${admin.name} (${admin.email})`);
        });
      } else {
        console.log('  No admins assigned');
      }
    }
    
    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('Error verifying admin competitions:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
verifyAdminCompetitions();
