/**
 * Cleanup Script: Remove old competition-related fields from Team documents
 * 
 * This script removes the old fields (competition, players, isSubmitted, etc.)
 * from Team documents after migrating to the CompetitionTeam model.
 * 
 * Run with: node Server/scripts/cleanupOldTeamFields.js
 */

require('dotenv').config({ path: './Server/.env' });
const mongoose = require('mongoose');

async function cleanupOldTeamFields() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the Team collection directly
    const db = mongoose.connection.db;
    const teamsCollection = db.collection('teams');

    // Find all teams with old fields
    const teamsWithOldFields = await teamsCollection.find({
      $or: [
        { competition: { $exists: true } },
        { players: { $exists: true } },
        { isSubmitted: { $exists: true } },
        { submittedAt: { $exists: true } },
        { paymentStatus: { $exists: true } },
        { paymentAmount: { $exists: true } }
      ]
    }).toArray();

    console.log(`Found ${teamsWithOldFields.length} teams with old fields`);

    if (teamsWithOldFields.length === 0) {
      console.log('No teams need cleanup. All done!');
      return;
    }

    // Ask for confirmation
    console.log('\nThis will remove the following fields from Team documents:');
    console.log('- competition');
    console.log('- players');
    console.log('- isSubmitted');
    console.log('- submittedAt');
    console.log('- paymentStatus');
    console.log('- paymentAmount');
    console.log('\nMake sure you have run the migration script first!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Remove old fields from all teams
    const result = await teamsCollection.updateMany(
      {},
      {
        $unset: {
          competition: '',
          players: '',
          isSubmitted: '',
          submittedAt: '',
          paymentStatus: '',
          paymentAmount: ''
        }
      }
    );

    console.log(`\nCleanup completed!`);
    console.log(`Modified ${result.modifiedCount} team documents`);

  } catch (error) {
    console.error('Cleanup failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run cleanup
cleanupOldTeamFields();
