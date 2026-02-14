/**
 * Migration Script: Migrate from Team.competition to CompetitionTeam model
 * 
 * This script migrates existing teams that have a competition field
 * to the new CompetitionTeam model, allowing teams to participate
 * in multiple competitions.
 * 
 * Run with: node Server/scripts/migrateToCompetitionTeams.js
 */

require('dotenv').config({ path: './Server/.env' });
const mongoose = require('mongoose');
const Team = require('../models/Team');
const CompetitionTeam = require('../models/CompetitionTeam');
const Competition = require('../models/Competition');

async function migrateToCompetitionTeams() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Use raw MongoDB collections to access old fields
    const db = mongoose.connection.db;
    const teamsCollection = db.collection('teams');
    
    // Find all teams that have a competition field
    const teamsWithCompetition = await teamsCollection.find({ 
      competition: { $exists: true, $ne: null } 
    }).toArray();
    
    console.log(`Found ${teamsWithCompetition.length} teams with competition assignments`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const team of teamsWithCompetition) {
      try {
        console.log(`\nProcessing team: ${team.name}`);
        console.log(`  Team ID: ${team._id}`);
        console.log(`  Competition ID: ${team.competition}`);
        console.log(`  Coach ID: ${team.coach}`);

        // Validate that competition exists
        const competition = await Competition.findById(team.competition);
        if (!competition) {
          console.log(`  ⚠ Skipping - Competition ${team.competition} not found`);
          skippedCount++;
          continue;
        }

        // Check if CompetitionTeam already exists
        const existingCompetitionTeam = await CompetitionTeam.findOne({
          team: team._id,
          competition: team.competition
        });

        if (existingCompetitionTeam) {
          console.log(`  ✓ Skipping - already migrated`);
          skippedCount++;
          continue;
        }

        // Create CompetitionTeam entry
        const competitionTeam = new CompetitionTeam({
          team: team._id,
          competition: team.competition,
          coach: team.coach,
          players: team.players || [],
          isSubmitted: team.isSubmitted || false,
          submittedAt: team.submittedAt,
          paymentStatus: team.paymentStatus || 'pending',
          paymentAmount: team.paymentAmount,
          isActive: team.isActive !== undefined ? team.isActive : true
        });

        await competitionTeam.save();
        console.log(`  ✓ Created CompetitionTeam: ${competitionTeam._id}`);

        // Add to competition's teams array
        if (!competition.teams) {
          competition.teams = [];
        }
        competition.teams.push(competitionTeam._id);
        await competition.save();
        console.log(`  ✓ Added to competition's teams array`);

        console.log(`  ✓ Successfully migrated team ${team.name}`);
        migratedCount++;

      } catch (error) {
        console.error(`  ✗ Error migrating team ${team.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total teams found: ${teamsWithCompetition.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped (already migrated): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);

    console.log('\nMigration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify the migrated data in the database');
    console.log('2. Test the application with the new CompetitionTeam model');
    console.log('3. Once verified, you can remove old fields from Team documents');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrateToCompetitionTeams();
