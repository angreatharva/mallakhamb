const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../.env' });

// Import models
const Admin = require('../models/Admin');
const Coach = require('../models/Coach');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const Judge = require('../models/Judge');
const Score = require('../models/Score');
const Transaction = require('../models/Transaction');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Helper function to hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Helper function to calculate age group
const calculateAgeGroup = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  const age = today.getFullYear() - birthDate.getFullYear();
  
  if (age < 10) return 'Under10';
  if (age < 12) return 'Under12';
  if (age < 14) return 'Under14';
  if (age < 16) return 'Under16';
  if (age < 18) return 'Under18';
  return 'Above18';
};

// Data arrays
const firstNames = {
  male: ['Atharva', 'Preetesh', 'Mayur', 'Dhruv', 'Aman', 'Vighnesh', 'Raj', 'Arjun', 'Ishaan', 'Kabir', 
         'Manav', 'Veer', 'Yash', 'Rohan', 'Aditya', 'Siddharth', 'Karan', 'Nikhil', 'Pranav', 'Sahil',
         'Arnav', 'Vedant', 'Aarav', 'Vivaan', 'Reyansh'],
  female: ['Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Nisha', 'Priya', 'Riya', 'Saanvi', 'Tanvi',
           'Anika', 'Avni', 'Kiara', 'Myra', 'Navya', 'Pari', 'Sara', 'Tara', 'Zara', 'Aditi']
};

const lastNames = ['Angre', 'Gamre', 'Pashte', 'Posture', 'Dighe', 'Kasture', 'Mehta', 'Kulkarni', 'Soni',
                   'Gupta', 'Shah', 'More', 'Patil', 'Deshmukh', 'Joshi', 'Sharma', 'Kumar', 'Singh',
                   'Reddy', 'Nair', 'Iyer', 'Rao', 'Verma', 'Agarwal', 'Chopra'];

const teamNames = ['SGAM', 'Sane Guruji Arogya Mandir', 'AIGM', 'Mumbai Warriors', 'Pune Challengers',
                   'Delhi Dynamos', 'Bangalore Tigers', 'Chennai Champions', 'Kolkata Knights',
                   'Hyderabad Heroes', 'Jaipur Jaguars', 'Lucknow Lions', 'Ahmedabad Aces',
                   'Chandigarh Cheetahs', 'Bhopal Braves', 'Indore Invincibles', 'Nagpur Ninjas',
                   'Surat Strikers', 'Vadodara Victors', 'Rajkot Raptors'];

const coachNames = ['Rajesh Amrale', 'Naresh Jadhav', 'Yatin Nachre', 'Suresh Patil', 'Ramesh Kumar',
                    'Vijay Singh', 'Anil Sharma', 'Prakash Deshmukh', 'Mahesh Joshi', 'Santosh Reddy',
                    'Dinesh Nair', 'Ganesh Iyer', 'Rakesh Rao', 'Mukesh Verma', 'Ashok Agarwal',
                    'Deepak Chopra', 'Sanjay Gupta', 'Manoj Shah', 'Ravi More', 'Ajay Patil'];

const adminNames = ['Ravi Gaikwad','Atharva Angre','Vinayak Dhamne','Pradeep Kumar','Sunil Sharma',
                    'Amit Patil','Rahul Verma','Sandeep Singh','Vikas Yadav','Nikhil Joshi',
                    'Rohit Kulkarni','Ankit Jain','Deepak Mishra','Karan Mehta','Manish Gupta',
                    'Sachin Deshmukh','Ajay Pawar','Tejas More','Harsh Agarwal','Pankaj Tiwari'];

const competitionData = [
  { name: 'Khelo India 2026', level: 'national', place: 'Bhopal', startDate: '2026-05-01', endDate: '2026-05-03' },
  { name: 'Bhausaheb Mumbai 2026', level: 'state', place: 'Mumbai', startDate: '2026-04-04', endDate: '2026-04-05' },
  { name: 'Bhausaheb Pune 2026', level: 'state', place: 'Pune', startDate: '2026-04-11', endDate: '2026-04-15' },
  { name: "Mayor's Cup 2026", level: 'national', place: 'Mumbai', startDate: '2026-03-01', endDate: '2026-03-02' },
  { name: 'National Championship 2026', level: 'national', place: 'Delhi', startDate: '2026-06-15', endDate: '2026-06-20' }
];

const cities = ['Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Jaipur',
                'Lucknow', 'Ahmedabad', 'Chandigarh', 'Bhopal', 'Indore', 'Nagpur', 'Surat'];

// Main population function
const populateDatabase = async () => {
  try {
    console.log('Starting database population...\n');

    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      Admin.deleteMany({}),
      Coach.deleteMany({}),
      Player.deleteMany({}),
      Team.deleteMany({}),
      Competition.deleteMany({}),
      Judge.deleteMany({}),
      Score.deleteMany({}),
      Transaction.deleteMany({})
    ]);
    console.log('Existing data cleared.\n');

    // 1. Create Super Admin
    console.log('Creating Super Admin...');
    const superAdmin = await Admin.create({
      name: 'Super Admin',
      email: 'superadmin@gmail.com',
      password: ('Superadmin@2026'),
      role: 'super_admin',
      isActive: true
    });
    console.log(`Super Admin created: ${superAdmin.email}\n`);

    // 2. Create Admins (20+)
    console.log('Creating Admins...');
    const admins = [];
    for (let i = 0; i < adminNames.length; i++) {
      const admin = await Admin.create({
        name: adminNames[i],
        email: `${adminNames[i].toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        password: (`${adminNames[i].split(' ')[0]}@2026`),
        role: 'admin',
        isActive: true,
        competitions: []
      });
      admins.push(admin);
      console.log(`Admin created: ${admin.email}`);
    }
    
    // Create additional admins to reach 20+
    for (let i = adminNames.length; i < 20; i++) {
      const admin = await Admin.create({
        name: `Admin ${i + 1}`,
        email: `admin${i + 1}@mallakhamb.com`,
        password: (`Admin${i + 1}@2026`),
        role: 'admin',
        isActive: true,
        competitions: []
      });
      admins.push(admin);
      console.log(`Admin created: ${admin.email}`);
    }
    console.log(`Total Admins created: ${admins.length}\n`);

    // 3. Create Competitions (20+)
    console.log('Creating Competitions...');
    const competitions = [];
    const ageGroups = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'];
    const ageGroupsStarted = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'];
    const genders = ['Male', 'Female'];
    const competitionTypes = ['competition_1', 'competition_2', 'competition_3'];
    
    for (let i = 0; i < competitionData.length; i++) {
      const comp = competitionData[i];
      const assignedAdmins = [admins[i % admins.length]._id];
      
      const competition = await Competition.create({
        name: comp.name,
        level: comp.level,
        place: comp.place,
        year: 2026,
        startDate: new Date(comp.startDate),
        endDate: new Date(comp.endDate),
        description: `${comp.level.charAt(0).toUpperCase() + comp.level.slice(1)} level Mallakhamb competition`,
        status: 'upcoming',
        competitionTypes: competitionTypes,
        admins: assignedAdmins,
        ageGroups: genders.flatMap(gender => 
          ageGroups.map(ageGroup => ({ gender, ageGroup }))
        ),
        registeredTeams: [],
        startedAgeGroups: [],
        createdBy: superAdmin._id
      });
      
      // Update admin's competitions
      await Admin.findByIdAndUpdate(assignedAdmins[0], {
        $push: { competitions: competition._id }
      });
      
      competitions.push(competition);
      console.log(`Competition created: ${competition.name}`);
    }
    
    // Create additional competitions to reach 20+
    for (let i = competitionData.length; i < 20; i++) {
      const city = cities[i % cities.length];
      const level = ['state', 'national', 'international'][i % 3];
      const assignedAdmins = [admins[i % admins.length]._id];
      
      const competition = await Competition.create({
        name: `${city} Championship ${2026 + Math.floor(i / 15)}`,
        level: level,
        place: city,
        year: 2026 + Math.floor(i / 15),
        startDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-01`),
        endDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-05`),
        description: `${level.charAt(0).toUpperCase() + level.slice(1)} level competition in ${city}`,
        status: 'upcoming',
        competitionTypes: competitionTypes,
        admins: assignedAdmins,
        ageGroups: genders.flatMap(gender => 
          ageGroups.slice(0, 4).map(ageGroup => ({ gender, ageGroup }))
        ),
        registeredTeams: [],
        startedAgeGroups: [],
        createdBy: superAdmin._id
      });
      
      await Admin.findByIdAndUpdate(assignedAdmins[0], {
        $push: { competitions: competition._id }
      });
      
      competitions.push(competition);
      console.log(`Competition created: ${competition.name}`);
    }
    console.log(`Total Competitions created: ${competitions.length}\n`);

    // 4. Create Coaches (20+)
    console.log('Creating Coaches...');
    const coaches = [];
    for (let i = 0; i < 20; i++) {
      const coachName = i < coachNames.length ? coachNames[i] : `Coach ${i + 1}`;
      const coach = await Coach.create({
        name: coachName,
        email: `${coachName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        password: (`${coachName.split(' ')[0]}@2026`),
        isActive: true
      });
      coaches.push(coach);
      console.log(`Coach created: ${coach.email}`);
    }
    console.log(`Total Coaches created: ${coaches.length}\n`);

    // 5. Create Teams (20+)
    console.log('Creating Teams...');
    const teams = [];
    for (let i = 0; i < 20; i++) {
      const teamName = i < teamNames.length ? teamNames[i] : `Team ${i + 1}`;
      const coach = coaches[i];
      
      const team = await Team.create({
        name: teamName,
        description: `Professional Mallakhamb team - ${teamName}`,
        coach: coach._id,
        isActive: true,
        isSubmitted: false,
        paymentStatus: 'pending'
      });
      
      // Update coach with team reference
      await Coach.findByIdAndUpdate(coach._id, { team: team._id });
      
      teams.push(team);
      console.log(`Team created: ${team.name}`);
    }
    console.log(`Total Teams created: ${teams.length}\n`);

    // 6. Create Players (100+ for variety)
    console.log('Creating Players...');
    const players = [];
    let playerCount = 0;
    
    // Create players for each team
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
      const team = teams[teamIndex];
      const playersPerTeam = 5 + Math.floor(Math.random() * 6); // 5-10 players per team
      
      for (let i = 0; i < playersPerTeam; i++) {
        const gender = Math.random() > 0.5 ? 'Male' : 'Female';
        const firstName = firstNames[gender.toLowerCase()][Math.floor(Math.random() * firstNames[gender.toLowerCase()].length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        
        // Generate random birth year for different age groups
        const ageGroupIndex = Math.floor(Math.random() * 6);
        let birthYear;
        switch (ageGroupIndex) {
          case 0: birthYear = 2016 + Math.floor(Math.random() * 2); break; // Under10
          case 1: birthYear = 2014 + Math.floor(Math.random() * 2); break; // Under12
          case 2: birthYear = 2012 + Math.floor(Math.random() * 2); break; // Under14
          case 3: birthYear = 2010 + Math.floor(Math.random() * 2); break; // Under16
          case 4: birthYear = 2008 + Math.floor(Math.random() * 2); break; // Under18
          default: birthYear = 1995 + Math.floor(Math.random() * 10); break; // Above18
        }
        
        const dateOfBirth = new Date(`${birthYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`);
        const ageGroup = calculateAgeGroup(dateOfBirth);
        
        const player = await Player.create({
          firstName: firstName,
          lastName: lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${playerCount}@gmail.com`,
          password: (`${firstName}@2026`),
          dateOfBirth: dateOfBirth,
          gender: gender,
          team: team._id,
          ageGroup: ageGroup,
          isActive: true
        });
        
        players.push(player);
        playerCount++;
        
        if (playerCount % 20 === 0) {
          console.log(`${playerCount} players created...`);
        }
      }
    }
    console.log(`Total Players created: ${players.length}\n`);

    // 7. Register Teams for Competitions and Add Players
    console.log('Registering teams for competitions...');
    const transactions = [];
    
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const competition = competitions[i % competitions.length];
      const teamPlayers = players.filter(p => p.team.toString() === team._id.toString());
      
      // Create registered team entry in competition
      const registeredTeamData = {
        team: team._id,
        coach: team.coach,
        players: teamPlayers.map(p => ({
          player: p._id,
          ageGroup: p.ageGroup,
          gender: p.gender
        })),
        isSubmitted: true,
        submittedAt: new Date(),
        paymentStatus: 'completed',
        paymentAmount: 500 + (teamPlayers.length * 100),
        isActive: true,
        createdAt: new Date()
      };
      
      await Competition.findByIdAndUpdate(competition._id, {
        $push: { registeredTeams: registeredTeamData }
      });
      
      // Update team with competition
      await Team.findByIdAndUpdate(team._id, {
        competition: competition._id,
        isSubmitted: true,
        submittedAt: new Date(),
        paymentStatus: 'completed',
        paymentAmount: 500 + (teamPlayers.length * 100)
      });
      
      // Create transaction
      const transaction = await Transaction.create({
        competition: competition._id,
        team: team._id,
        coach: team.coach,
        source: 'coach',
        type: 'team_submission',
        amount: 500 + (teamPlayers.length * 100),
        paymentStatus: 'completed',
        description: `Team ${team.name} submitted for ${competition.name}`,
        metadata: {
          playerCount: teamPlayers.length,
          baseFee: 500,
          perPlayerFee: 100
        }
      });
      
      transactions.push(transaction);
      console.log(`Team ${team.name} registered for ${competition.name}`);
    }
    console.log(`Total Transactions created: ${transactions.length}\n`);

    // 8. Create Judges (100+ for all competitions)
    console.log('Creating Judges...');
    const judges = [];
    const judgeTypes = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
    
    for (let compIndex = 0; compIndex < competitions.length; compIndex++) {
      const competition = competitions[compIndex];
      
      // Create judges for each gender and age group combination
      for (const ageGroupData of competition.ageGroups) {
        const { gender, ageGroup } = ageGroupData;
        
        // Use the age group directly (already in correct format)
        const judgeAgeGroup = ageGroup;
        
        // Create 5 judges for each combination
        for (let judgeNo = 1; judgeNo <= 5; judgeNo++) {
          const judgeType = judgeTypes[judgeNo - 1];
          const judgeName = `Judge ${gender.charAt(0)}${judgeAgeGroup}${judgeNo} ${competition.place}`;
          const username = `judge_${competition.place.toLowerCase()}_${gender.toLowerCase()}_${judgeAgeGroup.toLowerCase()}_${judgeNo}`.replace(/\s+/g, '');
          
          const judge = await Judge.create({
            competition: competition._id,
            name: judgeName,
            username: username,
            password: ('Judge@2026'),
            judgeType: judgeType,
            judgeNo: judgeNo,
            gender: gender,
            ageGroup: judgeAgeGroup,
            competitionTypes: competition.competitionTypes,
            isActive: true,
            mustResetPassword: false
          });
          
          judges.push(judge);
        }
      }
      
      console.log(`Judges created for ${competition.name}`);
    }
    console.log(`Total Judges created: ${judges.length}\n`);

    // 9. Start Age Groups
    console.log('Starting age groups...');
    for (const competition of competitions) {
      for (const ageGroupData of competition.ageGroups) {
        const { gender, ageGroup } = ageGroupData;
        
        // Use the age group directly (already in correct format)
        const startedAgeGroup = ageGroup;
        
        for (const competitionType of competition.competitionTypes) {
          await Competition.findByIdAndUpdate(competition._id, {
            $push: {
              startedAgeGroups: {
                gender: gender,
                ageGroup: startedAgeGroup,
                competitionType: competitionType,
                startedAt: new Date()
              }
            }
          });
        }
      }
      console.log(`Age groups started for ${competition.name}`);
    }
    console.log('All age groups started.\n');

    // 10. Create Scores (50+ score records)
    console.log('Creating Scores...');
    const scores = [];
    
    for (let i = 0; i < Math.min(competitions.length, 10); i++) {
      const competition = competitions[i];
      const competitionTeams = await Competition.findById(competition._id).select('registeredTeams');
      
      if (competitionTeams.registeredTeams.length === 0) continue;
      
      for (const registeredTeam of competitionTeams.registeredTeams.slice(0, 5)) {
        const team = await Team.findById(registeredTeam.team);
        if (!team) continue;
        
        const teamPlayers = registeredTeam.players;
        if (teamPlayers.length === 0) continue;
        
        const gender = teamPlayers[0].gender;
        const ageGroup = teamPlayers[0].ageGroup;
        
        // Create player scores
        const playerScores = [];
        for (const playerData of teamPlayers) {
          const player = await Player.findById(playerData.player);
          if (!player) continue;
          
          // Generate random judge scores
          const seniorJudgeScore = 8.0 + Math.random() * 2; // 8.0-10.0
          const judge1Score = 7.5 + Math.random() * 2.5;
          const judge2Score = 7.5 + Math.random() * 2.5;
          const judge3Score = 7.5 + Math.random() * 2.5;
          const judge4Score = 7.5 + Math.random() * 2.5;
          
          const executionAverage = (judge1Score + judge2Score + judge3Score + judge4Score) / 4;
          const baseScore = seniorJudgeScore;
          const tolerance = 0.25;
          
          let averageMarks;
          if (Math.abs(executionAverage - baseScore) <= tolerance) {
            averageMarks = baseScore;
          } else {
            averageMarks = executionAverage;
          }
          
          const deduction = Math.random() * 0.5;
          const otherDeduction = Math.random() * 0.3;
          const finalScore = Math.max(0, averageMarks - deduction - otherDeduction);
          
          playerScores.push({
            playerId: player._id,
            playerName: `${player.firstName} ${player.lastName}`,
            time: `${Math.floor(Math.random() * 3) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
            judgeScores: {
              seniorJudge: parseFloat(seniorJudgeScore.toFixed(2)),
              judge1: parseFloat(judge1Score.toFixed(2)),
              judge2: parseFloat(judge2Score.toFixed(2)),
              judge3: parseFloat(judge3Score.toFixed(2)),
              judge4: parseFloat(judge4Score.toFixed(2))
            },
            scoreBreakdown: {
              difficulty: {
                aClass: Math.floor(Math.random() * 5),
                bClass: Math.floor(Math.random() * 5),
                cClass: Math.floor(Math.random() * 3),
                total: 0
              },
              combination: {
                fullApparatusUtilization: Math.random() > 0.3,
                rightLeftExecution: Math.random() > 0.3,
                forwardBackwardFlexibility: Math.random() > 0.3,
                minimumElementCount: Math.random() > 0.2,
                total: 0
              },
              execution: parseFloat(executionAverage.toFixed(2)),
              originality: parseFloat((Math.random() * 0.5).toFixed(2))
            },
            executionAverage: parseFloat(executionAverage.toFixed(2)),
            baseScore: parseFloat(baseScore.toFixed(2)),
            baseScoreApplied: Math.abs(executionAverage - baseScore) <= tolerance,
            toleranceUsed: tolerance,
            averageMarks: parseFloat(averageMarks.toFixed(2)),
            deduction: parseFloat(deduction.toFixed(2)),
            otherDeduction: parseFloat(otherDeduction.toFixed(2)),
            finalScore: parseFloat(finalScore.toFixed(2))
          });
        }
        
        // Create score record
        const score = await Score.create({
          competition: competition._id,
          teamId: team._id,
          gender: gender,
          ageGroup: ageGroup,
          competitionType: 'Competition I',
          timeKeeper: 'Timekeeper Name',
          scorer: 'Scorer Name',
          remarks: 'Good performance',
          isLocked: Math.random() > 0.5,
          playerScores: playerScores
        });
        
        scores.push(score);
      }
      
      console.log(`Scores created for ${competition.name}`);
    }
    console.log(`Total Score records created: ${scores.length}\n`);

    // Print Summary
    console.log('\n========================================');
    console.log('DATABASE POPULATION COMPLETE');
    console.log('========================================\n');
    
    console.log('Summary:');
    console.log(`- Super Admin: 1`);
    console.log(`- Admins: ${admins.length}`);
    console.log(`- Competitions: ${competitions.length}`);
    console.log(`- Coaches: ${coaches.length}`);
    console.log(`- Teams: ${teams.length}`);
    console.log(`- Players: ${players.length}`);
    console.log(`- Judges: ${judges.length}`);
    console.log(`- Transactions: ${transactions.length}`);
    console.log(`- Score Records: ${scores.length}`);
    
    console.log('\n========================================');
    console.log('SAMPLE LOGIN CREDENTIALS');
    console.log('========================================\n');
    
    console.log('Super Admin:');
    console.log('  Email: superadmin@gmail.com');
    console.log('  Password: SuperAdmin@2026\n');
    
    console.log('Sample Admin:');
    console.log(`  Email: ${admins[0].email}`);
    console.log(`  Password: ${admins[0].name.split(' ')[0]}@2026\n`);
    
    console.log('Sample Coach:');
    console.log(`  Email: ${coaches[0].email}`);
    console.log(`  Password: ${coaches[0].name.split(' ')[0]}@2026\n`);
    
    console.log('Sample Player:');
    console.log(`  Email: ${players[0].email}`);
    console.log(`  Password: ${players[0].firstName}@2026\n`);
    
    console.log('Sample Judge:');
    console.log(`  Username: ${judges[0].username}`);
    console.log('  Password: Judge@2026\n');
    
    console.log('========================================\n');

  } catch (error) {
    console.error('Error populating database:', error);
    throw error;
  }
};

// Run the script
const run = async () => {
  try {
    await connectDB();
    await populateDatabase();
    console.log('Database population completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to populate database:', error);
    process.exit(1);
  }
};

run();
