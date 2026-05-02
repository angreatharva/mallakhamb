// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Player = require('../models/Player');

/**
 * Test the player teams API to verify coach information is populated
 */
const testPlayerTeamsAPI = async () => {
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

        // Create or find test player
        let player = await Player.findOne({ email: 'testplayer@example.com' });
        
        if (!player) {
            console.log('👤 Creating test player...');
            player = new Player({
                firstName: 'Test',
                lastName: 'Player',
                email: 'testplayer@example.com',
                password: 'Player@2026',
                dateOfBirth: new Date('2000-01-01'),
                gender: 'Male',
                isActive: true
            });
            await player.save();
            console.log('✅ Test player created');
        } else {
            console.log('✅ Found existing test player');
        }

        // Login to get token
        console.log('🔐 Logging in to get authentication token...');
        const loginResponse = await fetch('http://localhost:5000/api/players/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'testplayer@example.com',
                password: 'Player@2026'
            })
        });

        if (!loginResponse.ok) {
            const errorData = await loginResponse.text();
            throw new Error(`Login failed: ${loginResponse.status} - ${errorData}`);
        }

        const loginData = await loginResponse.json();
        const token = loginData.data.token;
        console.log('✅ Login successful, token obtained\n');

        // Test the teams API
        console.log('🏆 Testing /api/players/teams endpoint...');
        const teamsResponse = await fetch('http://localhost:5000/api/players/teams', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!teamsResponse.ok) {
            const errorData = await teamsResponse.text();
            throw new Error(`Teams API failed: ${teamsResponse.status} - ${errorData}`);
        }

        const teamsData = await teamsResponse.json();
        console.log('✅ Teams API successful\n');

        console.log('═'.repeat(60));
        console.log('API RESPONSE');
        console.log('═'.repeat(60));
        console.log(JSON.stringify(teamsData, null, 2));
        console.log('═'.repeat(60));

        // Analyze the response
        if (teamsData.success && teamsData.data && Array.isArray(teamsData.data)) {
            console.log(`\n📊 Analysis: Found ${teamsData.data.length} teams`);
            
            teamsData.data.forEach((team, index) => {
                console.log(`\n   Team ${index + 1}: ${team.name}`);
                console.log(`   Coach ID: ${team.coach}`);
                
                if (typeof team.coach === 'object' && team.coach !== null) {
                    console.log(`   ✅ Coach Name: ${team.coach.name || 'N/A'}`);
                    console.log(`   ✅ Coach Email: ${team.coach.email || 'N/A'}`);
                    console.log('   ✅ Coach information is properly populated!');
                } else {
                    console.log('   ❌ Coach information is NOT populated (showing ID only)');
                }
                
                console.log(`   Description: ${team.description || 'N/A'}`);
            });
        } else {
            console.log('\n❌ Unexpected API response format');
        }

        console.log('\n' + '═'.repeat(60) + '\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error testing player teams API:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
};

testPlayerTeamsAPI();