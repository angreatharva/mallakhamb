// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Player = require('../models/Player');

const createPlayer = async () => {
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

        const firstName = 'Atharva';
        const lastName = 'Angre';
        const email = 'player@gmail.com';
        const password = 'Player@2026';
        const dateOfBirth = new Date('2002-09-08');
        const gender = 'Male';

        // Check if player already exists
        const existingPlayer = await Player.findOne({ email: email });
        if (existingPlayer) {
            console.log('⚠️  Player user already exists!');
            console.log('Player Details:');
            console.log(`- Name: ${existingPlayer.firstName} ${existingPlayer.lastName}`);
            console.log(`- Email: ${email}`);
            console.log(`- Gender: ${existingPlayer.gender}`);
            console.log(`- Age: ${existingPlayer.getAge()} years`);
            console.log(`- Age Group: ${existingPlayer.ageGroup || 'Not assigned'}`);
            console.log(`- Active: ${existingPlayer.isActive}`);
            console.log(`- Team: ${existingPlayer.team || 'Not assigned'}`);
            await mongoose.disconnect();
            process.exit(0);
        }

        // Create player user
        const player = new Player({
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            dateOfBirth: dateOfBirth,
            gender: gender,
            isActive: true
        });

        await player.save();
        console.log('✅ Player user created successfully!');
        console.log('Player Credentials:');
        console.log(`- Email: ${email}`);
        console.log(`- Password: ${password}`);
        console.log(`- Name: ${firstName} ${lastName}`);
        console.log(`- Gender: ${gender}`);
        console.log(`- Date of Birth: ${dateOfBirth.toISOString().split('T')[0]}`);
        console.log(`- Age: ${player.getAge()} years`);

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating player:', error.message);
        if (error.code === 11000) {
            console.log('⚠️  Player with this email already exists!');
        }
        await mongoose.disconnect();
        process.exit(1);
    }
};

createPlayer();
