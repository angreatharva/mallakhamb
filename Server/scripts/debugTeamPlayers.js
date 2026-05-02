require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Team = require('../models/Team');

async function debugTeamPlayers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the competition
    const competition = await Competition.findById('69ef7a214bdc94418e56bdb0');
    if (!competition) {
      console.log('Competition not found');
      return;
    }

    console.log('\n=== Competition:', competition.name, '===');

    // Find the registered team for coach
    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === '69f0e75060dca219cd5246d0'
    );

    if (!registeredTeam) {
      console.log('No registered team found for this coach');
      return;
    }

    console.log('\n=== Registered Team in Competition ===');
    console.log('Team ID:', registeredTeam.team);
    console.log('Players in registeredTeam.players:', registeredTeam.players.length);
    console.log('Players:', JSON.stringify(registeredTeam.players, null, 2));

    // Get the actual team document
    const team = await Team.findById(registeredTeam.team);
    if (team) {
      console.log('\n=== Team Document ===');
      console.log('Team Name:', team.name);
      console.log('Players in team.players:', team.players.length);
      console.log('Players:', JSON.stringify(team.players, null, 2));
    }

    console.log('\n=== Summary ===');
    console.log('Competition registeredTeam has:', registeredTeam.players.length, 'players');
    console.log('Team document has:', team?.players?.length || 0, 'players');
    console.log('These should match!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

debugTeamPlayers();
