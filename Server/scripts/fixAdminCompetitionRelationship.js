// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');

/**
 * Fix bidirectional relationship between admins and competitions
 * This script ensures that:
 * 1. If a competition has an admin in its admins array, that admin has the competition in their competitions array
 * 2. If an admin has a competition in their competitions array, that competition has the admin in its admins array
 */
const fixAdminCompetitionRelationship = async () => {
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

        // Get all competitions
        const competitions = await Competition.find({});
        console.log(`📊 Found ${competitions.length} competitions\n`);

        let updatedAdmins = 0;
        let updatedCompetitions = 0;

        // For each competition, ensure bidirectional relationship
        for (const competition of competitions) {
            console.log(`\n🏆 Processing: ${competition.name} (${competition.year})`);
            console.log(`   Competition has ${competition.admins.length} admins assigned`);

            // For each admin in the competition
            for (const adminId of competition.admins) {
                const admin = await Admin.findById(adminId);
                
                if (!admin) {
                    console.log(`   ⚠️  Admin ${adminId} not found - removing from competition`);
                    competition.admins = competition.admins.filter(id => id.toString() !== adminId.toString());
                    await competition.save();
                    updatedCompetitions++;
                    continue;
                }

                // Check if admin has this competition in their competitions array
                const hasCompetition = admin.competitions.some(
                    compId => compId.toString() === competition._id.toString()
                );

                if (!hasCompetition) {
                    console.log(`   ✏️  Adding competition to admin: ${admin.name} (${admin.email})`);
                    admin.competitions.push(competition._id);
                    await admin.save();
                    updatedAdmins++;
                } else {
                    console.log(`   ✅ Admin ${admin.name} already has this competition`);
                }
            }
        }

        // Now check all admins to ensure their competitions exist
        const admins = await Admin.find({});
        console.log(`\n\n👥 Found ${admins.length} admins\n`);

        for (const admin of admins) {
            if (admin.competitions.length === 0) {
                console.log(`\n👤 ${admin.name} (${admin.email}) - No competitions assigned`);
                continue;
            }

            console.log(`\n👤 ${admin.name} (${admin.email}) - ${admin.competitions.length} competitions`);

            // Check each competition in admin's array
            for (const compId of admin.competitions) {
                const competition = await Competition.findById(compId);
                
                if (!competition) {
                    console.log(`   ⚠️  Competition ${compId} not found - removing from admin`);
                    admin.competitions = admin.competitions.filter(
                        id => id.toString() !== compId.toString()
                    );
                    await admin.save();
                    updatedAdmins++;
                    continue;
                }

                // Check if competition has this admin in their admins array
                const hasAdmin = competition.admins.some(
                    adminId => adminId.toString() === admin._id.toString()
                );

                if (!hasAdmin) {
                    console.log(`   ✏️  Adding admin to competition: ${competition.name}`);
                    competition.admins.push(admin._id);
                    await competition.save();
                    updatedCompetitions++;
                } else {
                    console.log(`   ✅ Competition ${competition.name} already has this admin`);
                }
            }
        }

        console.log('\n\n📊 Summary:');
        console.log(`   - Admins updated: ${updatedAdmins}`);
        console.log(`   - Competitions updated: ${updatedCompetitions}`);
        console.log('\n✅ Relationship fix completed!');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing relationships:', error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

fixAdminCompetitionRelationship();
