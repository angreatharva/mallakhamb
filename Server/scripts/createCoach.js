// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Coach = require('../models/Coach');

const createCoach = async () => {
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

        const name = 'Atharva Angre';
        const email = 'coach@gmail.com'; // Lowercase for consistency
        const password = 'Coach@2026';

        // Check if coach already exists
        const existingCoach = await Coach.findOne({ email: email.toLowerCase() });
        if (existingCoach) {
            console.log('⚠️  Coach user already exists!');
            console.log('Coach Details:');
            console.log(`- Name: ${existingCoach.name}`);
            console.log(`- Email: ${existingCoach.email}`);
            console.log(`- Active: ${existingCoach.isActive}`);
            console.log(`- Team: ${existingCoach.team || 'Not assigned'}`);
            console.log('\n💡 To test the onboarding flow:');
            console.log('   1. Delete this coach from the database');
            console.log('   2. Register a new coach through the UI');
            console.log('   3. Or use a different email address');
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create coach user WITHOUT a team
        // This allows testing the complete onboarding flow:
        // Login → Create Team → Select Competition → Dashboard
        const coach = new Coach({
            name: name,
            email: email.toLowerCase(),
            password: password,
            team: null, // No team initially - coach will create one
            isActive: true
        });

        await coach.save();
        console.log('✅ Coach user created successfully!');
        console.log('\nCoach Credentials:');
        console.log(`- Email: ${email.toLowerCase()}`);
        console.log(`- Password: ${password}`);
        console.log(`- Name: ${name}`);
        console.log(`- Team: Not assigned (will create during onboarding)`);
        console.log('\n📋 Next Steps:');
        console.log('   1. Login at: http://localhost:5173/coach/login');
        console.log('   2. You will be redirected to: Select Competition');
        console.log('   3. Create a team when prompted');
        console.log('   4. Select a competition');
        console.log('   5. Access the dashboard');
        console.log('\n💡 Note: Coach will go through competition selection on every login');
        console.log('   This allows switching between competitions.');

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating coach:', error.message);
        if (error.code === 11000) {
            console.log('⚠️  Coach with this email already exists!');
        }
        await mongoose.disconnect();
        process.exit(1);
    }
};

createCoach();
