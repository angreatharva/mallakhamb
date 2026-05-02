require('dotenv').config();
const mongoose = require('mongoose');
const Player = require('../models/Player');

async function checkPlayers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const playerIds = [
      '69f21363a957f9153485bf91',
      '69f245a6dcb6f62d61275ad4'
    ];

    for (const playerId of playerIds) {
      const player = await Player.findById(playerId);
      if (player) {
        console.log(`\nPlayer ${playerId}:`);
        console.log(`  Name: ${player.firstName} ${player.lastName}`);
        console.log(`  Email: ${player.email}`);
        console.log(`  Active: ${player.isActive}`);
        console.log(`  Team: ${player.team}`);
      } else {
        console.log(`\nPlayer ${playerId}: NOT FOUND (deleted)`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkPlayers();
