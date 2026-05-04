// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');

/**
 * Verify admin-competition relationships
 */
const verifyAdminCompetitions = async () => {
    try {
        // Verify environment variable is loaded
        if (!process.env.MONGODB_URI) {
            console.error('❌ ERROR: MONGODB_URI not found in environment variables');
            console.error('Please check that Server/.env file exists and contains MONGODB_URI');
            process.exit(1);
        }

        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all admins
        const admins = await Admin.find({}).populate('competitions');
        console.log(`📊 Found ${admins.length} admins:\n`);

        for (const admin of admins) {
            console.log(`\n👤 ${admin.name} (${admin.email})`);
            console.log(`   Role: ${admin.role}`);
            console.log(`   Active: ${admin.isActive}`);
            console.log(`   Competitions: ${admin.competitions.length}`);
            
            if (admin.competitions.length > 0) {
                admin.competitions.forEach(comp => {
                    console.log(`      - ${comp.name} (${comp.year}) - ${comp.place}`);
                });
            }
        }

        // Get all competitions
        const competitions = await Competition.find({}).populate('admins');
        console.log(`\n\n🏆 Found ${competitions.length} competitions:\n`);

        for (const comp of competitions) {
            console.log(`\n🏆 ${comp.name} (${comp.year})`);
            console.log(`   Place: ${comp.place}`);
            console.log(`   Status: ${comp.status}`);
            console.log(`   Admins: ${comp.admins.length}`);
            
            if (comp.admins.length > 0) {
                comp.admins.forEach(admin => {
                    console.log(`      - ${admin.name} (${admin.email}) - ${admin.role}`);
                });
            }
        }

        await mongoose.disconnect();
        console.log('\n\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error verifying relationships:', error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

verifyAdminCompetitions();
