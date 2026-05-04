// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');

/**
 * Assign an admin to a competition
 * This creates the bidirectional relationship
 */
const assignAdminToCompetition = async () => {
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

        // Find the admin
        const adminEmail = 'admin@gmail.com';
        const admin = await Admin.findOne({ email: adminEmail });

        if (!admin) {
            console.error(`❌ Admin with email ${adminEmail} not found`);
            await mongoose.disconnect();
            process.exit(1);
        }

        console.log(`👤 Found admin: ${admin.name} (${admin.email})`);
        console.log(`   Current competitions: ${admin.competitions.length}\n`);

        // Get all competitions
        const competitions = await Competition.find({});
        console.log(`📊 Found ${competitions.length} competitions:\n`);

        competitions.forEach((comp, index) => {
            console.log(`${index + 1}. ${comp.name} (${comp.year}) - ${comp.place}`);
            console.log(`   Status: ${comp.status}`);
            console.log(`   Admins: ${comp.admins.length}`);
        });

        // Assign admin to all competitions
        console.log(`\n🔄 Assigning admin to all competitions...\n`);

        for (const competition of competitions) {
            // Check if admin is already assigned
            const isAssigned = competition.admins.some(
                adminId => adminId.toString() === admin._id.toString()
            );

            if (isAssigned) {
                console.log(`✅ Admin already assigned to: ${competition.name}`);
                
                // Ensure bidirectional relationship
                const hasCompetition = admin.competitions.some(
                    compId => compId.toString() === competition._id.toString()
                );
                
                if (!hasCompetition) {
                    admin.competitions.push(competition._id);
                    console.log(`   ✏️  Added competition to admin's array`);
                }
            } else {
                // Add admin to competition
                competition.admins.push(admin._id);
                await competition.save();
                console.log(`✏️  Added admin to: ${competition.name}`);

                // Add competition to admin
                admin.competitions.push(competition._id);
                console.log(`   ✏️  Added competition to admin's array`);
            }
        }

        // Save admin
        await admin.save();

        console.log(`\n✅ Assignment completed!`);
        console.log(`\n📊 Final state:`);
        console.log(`   Admin: ${admin.name}`);
        console.log(`   Competitions assigned: ${admin.competitions.length}`);

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error assigning admin:', error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

assignAdminToCompetition();
