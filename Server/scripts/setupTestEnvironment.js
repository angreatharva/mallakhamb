// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');

/**
 * Setup script for testing coach onboarding flow
 * Creates a clean test environment with:
 * - A test coach (no team)
 * - An upcoming competition
 * - Cleans up any existing test data
 */
const setupTestEnvironment = async () => {
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

        console.log('🧹 Step 1: Cleaning up existing test data...\n');

        // Clean up test coaches
        const testCoaches = await Coach.find({
            $or: [
                { email: /testcoach/i },
                { email: 'coach@gmail.com' }
            ]
        });

        for (const coach of testCoaches) {
            // Delete teams
            const teams = await Team.find({ coach: coach._id });
            for (const team of teams) {
                // Remove from competitions
                await Competition.updateMany(
                    { 'registeredTeams.team': team._id },
                    { $pull: { registeredTeams: { team: team._id } } }
                );
                await Team.findByIdAndDelete(team._id);
            }
            await Coach.findByIdAndDelete(coach._id);
            console.log(`   ✓ Cleaned up coach: ${coach.email}`);
        }

        // Clean up test competitions
        const testCompetitions = await Competition.find({
            name: /test/i
        });

        for (const comp of testCompetitions) {
            await Competition.findByIdAndDelete(comp._id);
            console.log(`   ✓ Cleaned up competition: ${comp.name}`);
        }

        console.log('\n✅ Cleanup complete!\n');

        console.log('🏗️  Step 2: Creating test environment...\n');

        // Create test coach
        const coach = new Coach({
            name: 'Test Coach',
            email: 'coach@gmail.com',
            password: 'Coach@2026',
            team: null,
            isActive: true
        });

        await coach.save();
        console.log('   ✓ Created test coach');
        console.log(`     Email: ${coach.email}`);
        console.log(`     Password: Coach@2026`);

        // Check if there's at least one upcoming competition
        const upcomingCompetitions = await Competition.find({
            status: 'upcoming',
            isDeleted: false
        });

        if (upcomingCompetitions.length === 0) {
            console.log('\n   ⚠️  No upcoming competitions found. Creating one...');

            // Find or create an admin
            let admin = await Admin.findOne({ email: 'admin@gmail.com' });
            if (!admin) {
                admin = await Admin.create({
                    name: 'Test Admin',
                    email: 'admin@gmail.com',
                    password: 'Admin@2026',
                    role: 'admin',
                    isActive: true
                });
                console.log('   ✓ Created test admin');
            }

            // Create test competition
            const competition = await Competition.create({
                name: 'Test Competition 2026',
                level: 'state',
                place: 'Mumbai',
                year: 2026,
                startDate: new Date('2026-06-01'),
                endDate: new Date('2026-06-05'),
                description: 'Test competition for coach onboarding',
                status: 'upcoming',
                competitionTypes: ['competition_1', 'competition_2', 'competition_3'],
                ageGroups: [
                    { gender: 'Male', ageGroup: 'Under10' },
                    { gender: 'Male', ageGroup: 'Under12' },
                    { gender: 'Male', ageGroup: 'Under14' },
                    { gender: 'Male', ageGroup: 'Under18' },
                    { gender: 'Male', ageGroup: 'Above18' },
                    { gender: 'Female', ageGroup: 'Under10' },
                    { gender: 'Female', ageGroup: 'Under12' },
                    { gender: 'Female', ageGroup: 'Under14' },
                    { gender: 'Female', ageGroup: 'Under16' },
                    { gender: 'Female', ageGroup: 'Above16' }
                ],
                admins: [admin._id],
                createdBy: admin._id,
                registeredTeams: [],
                startedAgeGroups: []
            });

            console.log('   ✓ Created test competition');
            console.log(`     Name: ${competition.name}`);
            console.log(`     Status: ${competition.status}`);
        } else {
            console.log(`   ✓ Found ${upcomingCompetitions.length} upcoming competition(s)`);
            upcomingCompetitions.forEach(comp => {
                console.log(`     - ${comp.name} (${comp.place})`);
            });
        }

        console.log('\n✅ Test environment setup complete!\n');

        console.log('═'.repeat(60));
        console.log('TEST ENVIRONMENT READY');
        console.log('═'.repeat(60));

        console.log('\n📋 Test Credentials:');
        console.log('   Email: coach@gmail.com');
        console.log('   Password: Coach@2026');

        console.log('\n🧪 Testing Instructions:');
        console.log('   1. Start the backend server:');
        console.log('      cd Server && npm start');
        console.log('');
        console.log('   2. Start the frontend:');
        console.log('      cd Web && npm run dev');
        console.log('');
        console.log('   3. Test the flow:');
        console.log('      a. Go to: http://localhost:5173/coach/login');
        console.log('      b. Login with credentials above');
        console.log('      c. Should redirect to: /coach/select-competition');
        console.log('      d. Select a competition');
        console.log('      e. Should redirect to: /coach/dashboard');
        console.log('');
        console.log('   4. Test returning coach:');
        console.log('      a. Logout from dashboard');
        console.log('      b. Login again');
        console.log('      c. Should go to competition selection again');
        console.log('      d. Can select same or different competition');

        console.log('\n💡 Additional Commands:');
        console.log('   - Cleanup test data: node Server/scripts/cleanupTestCoaches.js');
        console.log('   - Create fresh coach: node Server/scripts/createCoach.js');
        console.log('   - Run API test: node Server/tests/coach-onboarding-flow.test.js');

        console.log('\n' + '═'.repeat(60) + '\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up test environment:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
};

setupTestEnvironment();
