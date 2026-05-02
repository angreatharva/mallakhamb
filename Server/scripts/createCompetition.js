// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Admin = require('../models/Admin');

const createCompetition = async () => {
    try {
        // Verify environment variable is loaded
        if (!process.env.MONGODB_URI) {
            console.error('❌ ERROR: MONGODB_URI not found in environment variables');
            console.error('Please check that Server/.env file exists and contains MONGODB_URI');
            process.exit(1);
        }

        console.log('🔗 Connecting to MongoDB...');

        // Connect to database (using same DB as main app)
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Competition details
        const competitionData = {
            name: 'Bhausaheb Ranade Mallakhamb Competition',
            level: 'state',
            place: 'Mumbai',
            year: 2026,
            startDate: new Date('2026-06-01'),
            endDate: new Date('2026-06-05'),
            description: 'Annual state-level Mallakhamb competition',
            status: 'upcoming', // Explicitly set to upcoming so coaches can register
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
            ]
        };

        // Check if competition already exists
        const existingCompetition = await Competition.findOne({
            name: competitionData.name,
            year: competitionData.year,
            place: competitionData.place
        });

        if (existingCompetition) {
            console.log('⚠️  Competition already exists!');
            console.log('Competition Details:');
            console.log(`- Name: ${existingCompetition.name}`);
            console.log(`- Level: ${existingCompetition.level}`);
            console.log(`- Place: ${existingCompetition.place}`);
            console.log(`- Year: ${existingCompetition.year}`);
            console.log(`- Status: ${existingCompetition.status}`);
            console.log(`- Start Date: ${existingCompetition.startDate.toISOString().split('T')[0]}`);
            console.log(`- End Date: ${existingCompetition.endDate.toISOString().split('T')[0]}`);
            console.log(`- Age Groups: ${existingCompetition.ageGroups.length}`);
            console.log(`- Competition Types: ${existingCompetition.competitionTypes.join(', ')}`);
            console.log(`- Admins Assigned: ${existingCompetition.admins.length}`);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Find admin to assign (optional - can be assigned later)
        const admin = await Admin.findOne({ email: 'admin@gmail.com' });

        if (admin) {
            competitionData.admins = [admin._id];
            competitionData.createdBy = admin._id;
            console.log(`📝 Found admin to assign: ${admin.name} (${admin.email})`);
        } else {
            console.log('⚠️ Admin with email admin@gmail.com not found');
        }

        // Create competition
        const competition = new Competition(competitionData);

        // Status is already set to 'upcoming' in competitionData
        // No need to call setInitialStatus() which might override it

        await competition.save();

        console.log('✅ Competition created successfully!');
        console.log('\nCompetition Details:');
        console.log(`- Name: ${competition.name}`);
        console.log(`- Level: ${competition.level}`);
        console.log(`- Place: ${competition.place}`);
        console.log(`- Year: ${competition.year}`);
        console.log(`- Status: ${competition.status}`);
        console.log(`- Start Date: ${competition.startDate.toISOString().split('T')[0]}`);
        console.log(`- End Date: ${competition.endDate.toISOString().split('T')[0]}`);
        console.log(`- Description: ${competition.description}`);
        console.log(`\nAge Groups (${competition.ageGroups.length}):`);
        competition.ageGroups.forEach(ag => {
            console.log(`  - ${ag.gender} ${ag.ageGroup}`);
        });
        console.log(`\nCompetition Types:`);
        competition.competitionTypes.forEach(ct => {
            console.log(`  - ${ct}`);
        });
        if (competition.admins.length > 0) {
            console.log(`\nAssigned Admins: ${competition.admins.length}`);
        }

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating competition:', error.message);
        if (error.code === 11000) {
            console.log('⚠️  Competition with this name, year, and place already exists!');
        }
        await mongoose.disconnect();
        process.exit(1);
    }
};

createCompetition();
