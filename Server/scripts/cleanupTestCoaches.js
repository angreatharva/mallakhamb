// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Competition = require('../models/Competition');

/**
 * Cleanup script for test coaches and their data
 * Useful for testing the onboarding flow multiple times
 */
const cleanupTestCoaches = async () => {
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
        console.log('✅ Connected to MongoDB');

        console.log('\n🧹 Starting cleanup of test coaches...\n');

        // Find all test coaches (emails containing 'test' or specific test email)
        const testCoaches = await Coach.find({
            $or: [
                { email: /test/i },
                { email: 'coach@gmail.com' },
                { name: /test/i }
            ]
        });

        if (testCoaches.length === 0) {
            console.log('✅ No test coaches found to clean up.');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`Found ${testCoaches.length} test coach(es):\n`);
        testCoaches.forEach((coach, index) => {
            console.log(`${index + 1}. ${coach.name} (${coach.email})`);
            console.log(`   - Team: ${coach.team || 'None'}`);
        });

        console.log('\n🗑️  Cleaning up associated data...\n');

        let teamsDeleted = 0;
        let competitionsUpdated = 0;

        for (const coach of testCoaches) {
            // Find and delete teams created by this coach
            const teams = await Team.find({ coach: coach._id });
            
            for (const team of teams) {
                // Remove team from competitions
                const competitions = await Competition.find({
                    'registeredTeams.team': team._id
                });

                for (const competition of competitions) {
                    await Competition.findByIdAndUpdate(competition._id, {
                        $pull: {
                            registeredTeams: { team: team._id }
                        }
                    });
                    competitionsUpdated++;
                }

                // Delete the team
                await Team.findByIdAndDelete(team._id);
                teamsDeleted++;
                console.log(`   ✓ Deleted team: ${team.name}`);
            }

            // Delete the coach
            await Coach.findByIdAndDelete(coach._id);
            console.log(`   ✓ Deleted coach: ${coach.name} (${coach.email})`);
        }

        console.log('\n✅ Cleanup complete!\n');
        console.log('Summary:');
        console.log(`- Coaches deleted: ${testCoaches.length}`);
        console.log(`- Teams deleted: ${teamsDeleted}`);
        console.log(`- Competitions updated: ${competitionsUpdated}`);

        console.log('\n💡 You can now:');
        console.log('   1. Run createCoach.js to create a fresh test coach');
        console.log('   2. Test the complete onboarding flow');
        console.log('   3. Or register a new coach through the UI');

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
};

cleanupTestCoaches();
