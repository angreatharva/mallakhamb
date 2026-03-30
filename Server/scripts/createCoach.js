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

        const name = 'Test Coach';
        const email = 'coach@gmail.com';
        const password = 'Coach@2026';

        // Check if coach already exists
        const existingCoach = await Coach.findOne({ email: email });
        if (existingCoach) {
            console.log('⚠️  Coach user already exists!');
            console.log('Coach Details:');
            console.log(`- Name: ${existingCoach.name}`);
            console.log(`- Email: ${email}`);
            console.log(`- Active: ${existingCoach.isActive}`);
            console.log(`- Team: ${existingCoach.team || 'Not assigned'}`);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create coach user
        const coach = new Coach({
            name: name,
            email: email,
            password: password,
            isActive: true
        });

        await coach.save();
        console.log('✅ Coach user created successfully!');
        console.log('Coach Credentials:');
        console.log(`- Email: ${email}`);
        console.log(`- Password: ${password}`);
        console.log(`- Name: ${name}`);

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
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
