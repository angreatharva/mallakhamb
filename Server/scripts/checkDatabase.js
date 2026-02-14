require('dotenv').config({ path: './Server/.env' });
const mongoose = require('mongoose');

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Check teams
    console.log('=== TEAMS ===');
    const teams = await db.collection('teams').find({}).toArray();
    console.log(`Found ${teams.length} teams:`);
    teams.forEach(team => {
      console.log(`\nTeam: ${team.name}`);
      console.log(`  ID: ${team._id}`);
      console.log(`  Coach: ${team.coach}`);
      console.log(`  Competition: ${team.competition || 'null'}`);
      console.log(`  Players: ${team.players ? team.players.length : 0}`);
    });

    // Check competition teams
    console.log('\n=== COMPETITION TEAMS ===');
    const competitionTeams = await db.collection('competitionteams').find({}).toArray();
    console.log(`Found ${competitionTeams.length} competition teams:`);
    competitionTeams.forEach(ct => {
      console.log(`\nCompetitionTeam ID: ${ct._id}`);
      console.log(`  Team: ${ct.team}`);
      console.log(`  Competition: ${ct.competition}`);
      console.log(`  Coach: ${ct.coach}`);
      console.log(`  Players: ${ct.players ? ct.players.length : 0}`);
    });

    // Check competitions
    console.log('\n=== COMPETITIONS ===');
    const competitions = await db.collection('competitions').find({}).toArray();
    console.log(`Found ${competitions.length} competitions:`);
    competitions.forEach(comp => {
      console.log(`\nCompetition: ${comp.name}`);
      console.log(`  ID: ${comp._id}`);
      console.log(`  Teams: ${comp.teams ? comp.teams.length : 0}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkDatabase();
