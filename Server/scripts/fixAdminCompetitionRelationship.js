/**
 * Fix Admin-Competition Bidirectional Relationship
 * 
 * This script syncs the bidirectional relationship between admins and competitions.
 * It ensures that if a competition has an admin in its admins array,
 * that admin also has the competition in their competitions array.
 */

require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');

async function fixAdminCompetitionRelationship() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all competitions
    const competitions = await Competition.find({ isDeleted: false });
    console.log(`Found ${competitions.length} competitions`);

    let updatedAdmins = 0;
    let totalRelationships = 0;

    // For each competition, ensure all admins have the competition in their competitions array
    for (const competition of competitions) {
      if (!competition.admins || competition.admins.length === 0) {
        continue;
      }

      console.log(`\nProcessing competition: ${competition.name}`);
      console.log(`  Admins in competition: ${competition.admins.length}`);

      for (const adminId of competition.admins) {
        const admin = await Admin.findById(adminId);
        
        if (!admin) {
          console.log(`  ⚠️  Admin ${adminId} not found`);
          continue;
        }

        // Check if competition is already in admin's competitions array
        const hasCompetition = (admin.competitions || []).some(
          compId => compId.toString() === competition._id.toString()
        );

        if (!hasCompetition) {
          // Add competition to admin's competitions array
          admin.competitions = admin.competitions || [];
          admin.competitions.push(competition._id);
          await admin.save();
          
          console.log(`  ✓ Added competition to admin: ${admin.name} (${admin.email})`);
          updatedAdmins++;
        } else {
          console.log(`  - Admin ${admin.name} already has this competition`);
        }
        
        totalRelationships++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log(`Total relationships processed: ${totalRelationships}`);
    console.log(`Admins updated: ${updatedAdmins}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error fixing admin-competition relationship:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
fixAdminCompetitionRelationship();
