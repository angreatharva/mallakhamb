require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Player = require('../models/Player');

async function cleanupDeletedPlayers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const competitionId = '69ef7a214bdc94418e56bdb0';
    const coachId = '69f0e75060dca219cd5246d0';

    // Find the competition
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      console.log('Competition not found');
      return;
    }

    console.log('\n=== Cleaning up deleted players ===');
    console.log('Competition:', competition.name);

    // Find the registered team
    const registeredTeamIndex = competition.registeredTeams.findIndex(
      rt => rt.coach.toString() === coachId
    );

    if (registeredTeamIndex === -1) {
      console.log('No registered team found for this coach');
      return;
    }

    const registeredTeam = competition.registeredTeams[registeredTeamIndex];
    console.log('\nBefore cleanup:');
    console.log('Players:', registeredTeam.players.length);

    // Check each player and remove if deleted
    const validPlayers = [];
    for (const playerEntry of registeredTeam.players) {
      const player = await Player.findById(playerEntry.player);
      if (player) {
        console.log(`  ✓ Keeping player: ${player.firstName} ${player.lastName}`);
        validPlayers.push(playerEntry);
      } else {
        console.log(`  ✗ Removing deleted player: ${playerEntry.player}`);
      }
    }

    // Update the competition
    competition.registeredTeams[registeredTeamIndex].players = validPlayers;
    await competition.save();

    console.log('\nAfter cleanup:');
    console.log('Players:', validPlayers.length);
    console.log('\n✅ Cleanup complete!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

cleanupDeletedPlayers();
