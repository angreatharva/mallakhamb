// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Coach = require('../models/Coach');
const Team = require('../models/Team');

/**
 * Create test teams with coaches for testing player team selection
 */
const createTestTeams = async () => {
    try {
        // Verify environment variable is loaded
        if (!process.env.MONGODB_URI) {
            console.error('❌ ERROR: MONGODB_URI not found in environment variables');
            console.error('Please check that Server/.env file exists and contains MONGODB_URI');
            process.exit(1);
        }

        console.log('🔗 Connecting to MongoDB...');
        
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        console.log('🏗️  Creating test coaches and teams...\n');

        // Create test coaches and teams
        const testData = [
            {
                coachName: 'John Doe',
                coachEmail: 'john.doe@example.com',
                teamName: 'Team Alpha',
                teamDescription: 'A competitive team focused on excellence'
            },
            {
                coachName: 'Jane Smith',
                coachEmail: 'jane.smith@example.com',
                teamName: 'Team Beta',
                teamDescription: 'Dynamic team with strong fundamentals'
            },
            {
                coachName: 'Mike Johnson',
                coachEmail: 'mike.johnson@example.com',
                teamName: 'Team Gamma',
                teamDescription: 'Experienced team with proven track record'
            },
            {
                coachName: 'Sarah Wilson',
                coachEmail: 'sarah.wilson@example.com',
                teamName: 'Team Delta',
                teamDescription: 'Young and energetic team'
            }
        ];

        for (const data of testData) {
            // Check if coach already exists
            let coach = await Coach.findOne({ email: data.coachEmail });
            
            if (!coach) {
                // Create coach
                coach = new Coach({
                    name: data.coachName,
                    email: data.coachEmail,
                    password: 'Coach@2026', // Default password for testing
                    isActive: true
                });
                await coach.save();
                console.log(`   ✓ Created coach: ${coach.name} (${coach.email})`);
            } else {
                console.log(`   ✓ Found existing coach: ${coach.name} (${coach.email})`);
            }

            // Check if team already exists
            let team = await Team.findOne({ name: data.teamName, coach: coach._id });
            
            if (!team) {
                // Create team
                team = new Team({
                    name: data.teamName,
                    coach: coach._id,
                    description: data.teamDescription,
                    isActive: true
                });
                await team.save();
                console.log(`   ✓ Created team: ${team.name} for coach ${coach.name}`);
            } else {
                console.log(`   ✓ Found existing team: ${team.name} for coach ${coach.name}`);
            }
        }

        console.log('\n✅ Test teams and coaches created successfully!\n');

        console.log('═'.repeat(60));
        console.log('TEST TEAMS READY');
        console.log('═'.repeat(60));

        console.log('\n📋 Available Teams:');
        const teams = await Team.find({ isActive: true }).populate('coach', 'name email');
        teams.forEach(team => {
            console.log(`   - ${team.name}`);
            console.log(`     Coach: ${team.coach.name} (${team.coach.email})`);
            console.log(`     Description: ${team.description}`);
            console.log('');
        });

        console.log('🧪 Testing Instructions:');
        console.log('   1. Create a test player account');
        console.log('   2. Login as player and go to team selection');
        console.log('   3. You should see the teams above with coach names');

        console.log('\n' + '═'.repeat(60) + '\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating test teams:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
};

createTestTeams();