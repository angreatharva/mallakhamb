// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Player = require('../models/Player');
const Team = require('../models/Team'); // Add Team model import

/**
 * Test the player join team API to verify it works correctly
 */
const testPlayerJoinTeam = async () => {
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

        // Find test player
        let player = await Player.findOne({ email: 'testplayer@example.com' });
        
        if (!player) {
            console.log('❌ Test player not found. Please run testPlayerTeamsAPI.js first to create a test player.');
            process.exit(1);
        }

        console.log('✅ Found test player');

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

        // Get available teams first
        console.log('🏆 Getting available teams...');
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
        
        if (!teamsData.success || !teamsData.data || teamsData.data.length === 0) {
            console.log('❌ No teams available for testing');
            process.exit(1);
        }

        const firstTeam = teamsData.data[0];
        console.log(`✅ Found ${teamsData.data.length} teams. Testing with: ${firstTeam.name}\n`);

        // Test joining the team
        console.log('🤝 Testing join team API...');
        const joinResponse = await fetch('http://localhost:5000/api/players/team/join', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teamId: firstTeam._id
                // competitionId is now optional
            })
        });

        if (!joinResponse.ok) {
            const errorData = await joinResponse.text();
            throw new Error(`Join team API failed: ${joinResponse.status} - ${errorData}`);
        }

        const joinData = await joinResponse.json();
        console.log('✅ Join team API successful\n');

        console.log('═'.repeat(60));
        console.log('JOIN TEAM API RESPONSE');
        console.log('═'.repeat(60));
        console.log(JSON.stringify(joinData, null, 2));
        console.log('═'.repeat(60));

        // Verify the player was updated
        const updatedPlayer = await Player.findById(player._id).populate('team');
        console.log(`\n📊 Verification: Player team updated to: ${updatedPlayer.team?.name || 'None'}`);

        if (updatedPlayer.team && updatedPlayer.team._id.toString() === firstTeam._id) {
            console.log('✅ Player successfully joined the team!');
        } else {
            console.log('❌ Player team was not updated correctly');
        }

        console.log('\n' + '═'.repeat(60) + '\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error testing player join team:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
};

testPlayerJoinTeam();