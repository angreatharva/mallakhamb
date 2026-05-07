/**
 * Database Population Script
 * 
 * This script populates the database with a complete flow:
 * 1. Create SuperAdmin
 * 2. Create Admin
 * 3. Create Competition (SuperAdmin)
 * 4. Assign Admin to Competition
 * 5. Create Judge
 * 6. Create Coach
 * 7. Create Team (Coach)
 * 8. Register Team to Competition (Coach)
 * 9. Create Players
 * 10. Join Team (Players)
 * 11. Add Players to Competition Registration (Coach)
 * 12. Submit Team (Coach with payment simulation)
 * 
 * Usage: npm run populate-db
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');
const Competition = require('../models/Competition');
const Judge = require('../models/Judge');
const Player = require('../models/Player');
const Team = require('../models/Team');

// Configuration
const CONFIG = {
  superAdmin: {
    name: 'System SuperAdmin',
    email: 'superadmin.system@mallakhamb.com',
    password: 'SuperAdmin@2026',
    role: 'super_admin'
  },
  admin: {
    name: 'State Competition Admin',
    email: 'admin.state@mallakhamb.com',
    password: 'Admin@2026',
    role: 'admin'
  },
  competition: {
    name: 'State Mallakhamb Championship 2026',
    level: 'state',
    competitionTypes: ['competition_1', 'competition_2', 'competition_3'],
    place: 'Nagpur, Maharashtra',
    year: 2026,
    startDate: new Date('2026-12-15'),
    endDate: new Date('2026-12-20'),
    description: 'State Level Mallakhamb Championship featuring all three competition types',
    ageGroups: [
      { gender: 'Male', ageGroup: 'Under10' },
      { gender: 'Male', ageGroup: 'Under12' },
      { gender: 'Male', ageGroup: 'Under14' },
      { gender: 'Male', ageGroup: 'Under16' },
      { gender: 'Male', ageGroup: 'Under18' },
      { gender: 'Female', ageGroup: 'Under10' },
      { gender: 'Female', ageGroup: 'Under12' },
      { gender: 'Female', ageGroup: 'Under14' },
      { gender: 'Female', ageGroup: 'Under16' },
      { gender: 'Female', ageGroup: 'Under18' }
    ]
  },
  judges: [
    {
      name: 'Senior Judge Male U12',
      username: 'judge_senior_male_u12_state',
      password: 'Judge@2026',
      judgeNo: 1,
      judgeType: 'Senior Judge',
      gender: 'Male',
      ageGroup: 'Under12',
      competitionTypes: ['competition_1', 'competition_2', 'competition_3']
    },
    {
      name: 'Judge 1 Male U14',
      username: 'judge1_male_u14_state',
      password: 'Judge@2026',
      judgeNo: 2,
      judgeType: 'Judge 1',
      gender: 'Male',
      ageGroup: 'Under14',
      competitionTypes: ['competition_1', 'competition_2', 'competition_3']
    },
    {
      name: 'Senior Judge Female U12',
      username: 'judge_senior_female_u12_state',
      password: 'Judge@2026',
      judgeNo: 1,
      judgeType: 'Senior Judge',
      gender: 'Female',
      ageGroup: 'Under12',
      competitionTypes: ['competition_1', 'competition_2', 'competition_3']
    },
    {
      name: 'Judge 2 Male U16',
      username: 'judge2_male_u16_state',
      password: 'Judge@2026',
      judgeNo: 3,
      judgeType: 'Judge 2',
      gender: 'Male',
      ageGroup: 'Under16',
      competitionTypes: ['competition_1', 'competition_2']
    },
    {
      name: 'Judge 1 Female U14',
      username: 'judge1_female_u14_state',
      password: 'Judge@2026',
      judgeNo: 2,
      judgeType: 'Judge 1',
      gender: 'Female',
      ageGroup: 'Under14',
      competitionTypes: ['competition_1', 'competition_2', 'competition_3']
    }
  ],
  coach: {
    name: 'Pradeep Sharma',
    email: 'coach.pradeep@mallakhamb.com',
    password: 'Coach@2026'
  },
  team: {
    name: 'Nagpur Champions',
    description: 'Premier Mallakhamb team from Nagpur'
  },
  players: [
    {
      firstName: 'Vikram',
      lastName: 'Deshmukh',
      email: 'vikram.deshmukh@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2014-05-15'),
      gender: 'Male',
      ageGroup: 'Under12'
    },
    {
      firstName: 'Rahul',
      lastName: 'Joshi',
      email: 'rahul.joshi@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2012-08-22'),
      gender: 'Male',
      ageGroup: 'Under14'
    },
    {
      firstName: 'Sneha',
      lastName: 'Kulkarni',
      email: 'sneha.kulkarni@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2014-03-10'),
      gender: 'Female',
      ageGroup: 'Under12'
    },
    {
      firstName: 'Pooja',
      lastName: 'Patil',
      email: 'pooja.patil@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2012-11-05'),
      gender: 'Female',
      ageGroup: 'Under14'
    },
    {
      firstName: 'Aditya',
      lastName: 'Rao',
      email: 'aditya.rao@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2010-07-18'),
      gender: 'Male',
      ageGroup: 'Under16'
    },
    {
      firstName: 'Kavya',
      lastName: 'Nair',
      email: 'kavya.nair@example.com',
      password: 'Player@2026',
      dateOfBirth: new Date('2010-09-25'),
      gender: 'Female',
      ageGroup: 'Under16'
    }
  ]
};

// Utility functions
const log = {
  info: (msg, data = {}) => console.log(`✅ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
  warn: (msg, data = {}) => console.log(`⚠️  ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
  error: (msg, data = {}) => console.error(`❌ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
  step: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`)
};

/**
 * Main population function
 */
async function populateDatabase() {
  let connection = null;
  
  try {
    // Verify environment variable
    if (!process.env.MONGODB_URI) {
      log.error('MONGODB_URI not found in environment variables');
      log.error('Please check that Server/.env file exists and contains MONGODB_URI');
      process.exit(1);
    }

    log.step('STEP 0: Connecting to MongoDB');
    log.info('Database:', process.env.MONGODB_URI.split('/').pop());
    
    connection = await mongoose.connect(process.env.MONGODB_URI);
    log.info('Connected to MongoDB successfully');

    // Step 1: Create SuperAdmin
    log.step('STEP 1: Creating SuperAdmin');
    const superAdmin = await createSuperAdmin();
    log.info('SuperAdmin created', {
      id: superAdmin._id,
      email: superAdmin.email,
      role: superAdmin.role
    });

    // Step 2: Create Admin
    log.step('STEP 2: Creating Admin');
    const admin = await createAdmin();
    log.info('Admin created', {
      id: admin._id,
      email: admin.email,
      role: admin.role
    });

    // Step 3: Create Competition
    log.step('STEP 3: Creating Competition');
    const competition = await createCompetition(superAdmin._id);
    log.info('Competition created', {
      id: competition._id,
      name: competition.name,
      level: competition.level,
      ageGroups: competition.ageGroups.length
    });

    // Step 4: Assign Admin to Competition
    log.step('STEP 4: Assigning Admin to Competition');
    await assignAdminToCompetition(competition._id, admin._id);
    log.info('Admin assigned to competition');

    // Step 5: Create Judges
    log.step('STEP 5: Creating Judges');
    const judges = await createJudges(competition._id);
    log.info(`Created ${judges.length} judges`, {
      judges: judges.map(j => ({
        id: j._id,
        name: j.name,
        username: j.username,
        ageGroup: j.ageGroup,
        gender: j.gender
      }))
    });

    // Step 6: Create Coach
    log.step('STEP 6: Creating Coach');
    const coach = await createCoach();
    log.info('Coach created', {
      id: coach._id,
      name: coach.name,
      email: coach.email
    });

    // Step 7: Create Team
    log.step('STEP 7: Creating Team');
    const team = await createTeam(coach._id);
    log.info('Team created', {
      id: team._id,
      name: team.name,
      coach: team.coach
    });

    // Step 8: Register Team to Competition
    log.step('STEP 8: Registering Team to Competition');
    const updatedCompetition = await registerTeamToCompetition(competition._id, team._id, coach._id);
    log.info('Team registered to competition', {
      competitionId: competition._id,
      teamId: team._id,
      registeredTeamsCount: updatedCompetition.registeredTeams.length
    });

    // Step 9: Create Players
    log.step('STEP 9: Creating Players');
    const players = await createPlayers();
    log.info(`Created ${players.length} players`, {
      players: players.map(p => ({
        id: p._id,
        name: `${p.firstName} ${p.lastName}`,
        gender: p.gender,
        ageGroup: p.ageGroup
      }))
    });

    // Step 10: Join Team (Assign players to team)
    log.step('STEP 10: Assigning Players to Team');
    await assignPlayersToTeam(players, team._id);
    log.info('Players assigned to team');

    // Step 11: Add Players to Competition Registration
    log.step('STEP 11: Adding Players to Competition Registration');
    await addPlayersToCompetitionRegistration(competition._id, team._id, players);
    log.info('Players added to competition registration');

    // Step 12: Submit Team (with payment simulation)
    log.step('STEP 12: Submitting Team with Payment');
    await submitTeam(competition._id, team._id, players.length);
    log.info('Team submitted with payment completed');

    // Summary
    log.step('DATABASE POPULATION COMPLETED SUCCESSFULLY');
    console.log('\n📊 Summary:');
    console.log(`   - SuperAdmin: ${superAdmin.email} / ${CONFIG.superAdmin.password}`);
    console.log(`   - Admin: ${admin.email} / ${CONFIG.admin.password}`);
    console.log(`   - Competition: ${competition.name}`);
    console.log(`   - Judges: ${judges.length} created`);
    console.log(`   - Coach: ${coach.email} / ${CONFIG.coach.password}`);
    console.log(`   - Team: ${team.name}`);
    console.log(`   - Players: ${players.length} created and registered`);
    console.log(`   - Team Status: Submitted with payment completed`);
    console.log('\n🔐 Login Credentials:');
    console.log(`   SuperAdmin: ${superAdmin.email} / ${CONFIG.superAdmin.password}`);
    console.log(`   Admin: ${admin.email} / ${CONFIG.admin.password}`);
    console.log(`   Coach: ${coach.email} / ${CONFIG.coach.password}`);
    console.log(`   Judge (example): ${judges[0].username} / Judge@2026`);
    console.log(`   Player (example): ${players[0].email} / Player@2026`);
    console.log('\n✨ You can now login and test the application!\n');

  } catch (error) {
    log.error('Database population failed', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      log.info('Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

/**
 * Create SuperAdmin
 */
async function createSuperAdmin() {
  const existing = await Admin.findOne({ email: CONFIG.superAdmin.email });
  if (existing) {
    log.warn('SuperAdmin already exists, using existing one');
    return existing;
  }

  const superAdmin = new Admin(CONFIG.superAdmin);
  await superAdmin.save();
  return superAdmin;
}

/**
 * Create Admin
 */
async function createAdmin() {
  const existing = await Admin.findOne({ email: CONFIG.admin.email });
  if (existing) {
    log.warn('Admin already exists, using existing one');
    return existing;
  }

  const admin = new Admin(CONFIG.admin);
  await admin.save();
  return admin;
}

/**
 * Create Competition
 */
async function createCompetition(createdBy) {
  const existing = await Competition.findOne({
    name: CONFIG.competition.name,
    year: CONFIG.competition.year,
    place: CONFIG.competition.place
  });

  if (existing) {
    log.warn('Competition already exists, using existing one');
    return existing;
  }

  const competition = new Competition({
    ...CONFIG.competition,
    createdBy,
    admins: [createdBy],
    status: 'upcoming',
    registeredTeams: []
  });

  await competition.save();
  return competition;
}

/**
 * Assign Admin to Competition
 */
async function assignAdminToCompetition(competitionId, adminId) {
  const competition = await Competition.findById(competitionId);
  
  if (!competition.admins.includes(adminId)) {
    competition.admins.push(adminId);
    await competition.save();
  }

  const admin = await Admin.findById(adminId);
  if (!admin.competitions.includes(competitionId)) {
    admin.competitions.push(competitionId);
    await admin.save();
  }
}

/**
 * Create Judges
 */
async function createJudges(competitionId) {
  const judges = [];

  for (const judgeData of CONFIG.judges) {
    const existing = await Judge.findOne({
      username: judgeData.username,
      competition: competitionId
    });

    if (existing) {
      log.warn(`Judge ${judgeData.username} already exists, skipping`);
      judges.push(existing);
      continue;
    }

    const judge = new Judge({
      ...judgeData,
      competition: competitionId,
      isActive: true
    });

    await judge.save();
    judges.push(judge);
  }

  return judges;
}

/**
 * Create Coach
 */
async function createCoach() {
  const existing = await Coach.findOne({ email: CONFIG.coach.email });
  if (existing) {
    log.warn('Coach already exists, using existing one');
    return existing;
  }

  const coach = new Coach(CONFIG.coach);
  await coach.save();
  return coach;
}

/**
 * Create Team
 */
async function createTeam(coachId) {
  const existing = await Team.findOne({
    name: CONFIG.team.name,
    coach: coachId
  });

  if (existing) {
    log.warn('Team already exists, using existing one');
    return existing;
  }

  const team = new Team({
    ...CONFIG.team,
    coach: coachId,
    isActive: true
  });

  await team.save();

  // Update coach to reference this team
  await Coach.findByIdAndUpdate(coachId, { team: team._id });

  return team;
}

/**
 * Register Team to Competition
 */
async function registerTeamToCompetition(competitionId, teamId, coachId) {
  const competition = await Competition.findById(competitionId);

  // Check if team is already registered
  const existingRegistration = competition.registeredTeams.find(
    rt => rt.team.toString() === teamId.toString()
  );

  if (existingRegistration) {
    log.warn('Team already registered to competition');
    return competition;
  }

  // Register team
  competition.registeredTeams.push({
    team: teamId,
    coach: coachId,
    players: [],
    isSubmitted: false,
    paymentStatus: 'pending',
    isActive: true
  });

  await competition.save();
  return competition;
}

/**
 * Create Players
 */
async function createPlayers() {
  const players = [];

  for (const playerData of CONFIG.players) {
    const existing = await Player.findOne({ email: playerData.email });

    if (existing) {
      log.warn(`Player ${playerData.email} already exists, using existing one`);
      players.push(existing);
      continue;
    }

    const player = new Player(playerData);
    await player.save();
    players.push(player);
  }

  return players;
}

/**
 * Assign Players to Team
 */
async function assignPlayersToTeam(players, teamId) {
  for (const player of players) {
    if (!player.team || player.team.toString() !== teamId.toString()) {
      player.team = teamId;
      await player.save();
    }
  }
}

/**
 * Add Players to Competition Registration
 */
async function addPlayersToCompetitionRegistration(competitionId, teamId, players) {
  const competition = await Competition.findById(competitionId);

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.team.toString() === teamId.toString()
  );

  if (!registeredTeam) {
    throw new Error('Team not registered to competition');
  }

  // Add each player to the registration
  for (const player of players) {
    const existingPlayer = registeredTeam.players.find(
      p => p.player && p.player.toString() === player._id.toString()
    );

    if (!existingPlayer) {
      registeredTeam.players.push({
        player: player._id,
        ageGroup: player.ageGroup,
        gender: player.gender
      });
    }
  }

  await competition.save();
}

/**
 * Submit Team with Payment
 */
async function submitTeam(competitionId, teamId, playerCount) {
  const competition = await Competition.findById(competitionId);

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.team.toString() === teamId.toString()
  );

  if (!registeredTeam) {
    throw new Error('Team not registered to competition');
  }

  // Calculate payment amount: ₹500 base + ₹100 per player
  const paymentAmount = 500 + (playerCount * 100);

  // Simulate payment completion
  registeredTeam.isSubmitted = true;
  registeredTeam.submittedAt = new Date();
  registeredTeam.paymentStatus = 'completed';
  registeredTeam.paymentAmount = paymentAmount;
  registeredTeam.paymentGateway = 'razorpay';
  registeredTeam.paymentOrderId = `order_${Date.now()}`;
  registeredTeam.paymentId = `pay_${Date.now()}`;
  registeredTeam.paymentSignature = `sig_${Date.now()}`;
  registeredTeam.paymentVerifiedAt = new Date();

  await competition.save();
}

// Run the script
populateDatabase();
