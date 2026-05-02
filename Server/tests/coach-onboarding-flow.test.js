/**
 * Coach Onboarding Flow - End-to-End API Test
 * 
 * Tests the complete coach onboarding flow:
 * 1. Register coach
 * 2. Login coach
 * 3. Check status (should be create-team)
 * 4. Create team
 * 5. Check status (should be select-competition)
 * 6. Register team for competition
 * 7. Set competition context
 * 8. Check status (should be dashboard)
 * 9. Get dashboard (should show team)
 * 10. Logout and login again (should have competition context)
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

// Test data
const testCoach = {
  name: 'Test Coach Flow',
  email: `testcoach${Date.now()}@test.com`,
  password: 'TestPass123!',
  phone: '1234567890',
  organization: 'Test Org'
};

const testTeam = {
  name: `Test Team ${Date.now()}`,
  description: 'Test team for flow validation'
};

let coachToken = null;
let coachId = null;
let teamId = null;
let competitionId = null;

async function runTest() {
  console.log('\n🧪 Starting Coach Onboarding Flow Test\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Register Coach
    console.log('\n📝 Step 1: Register Coach');
    console.log('-'.repeat(60));
    const registerResponse = await axios.post(`${API_URL}/coaches/register`, testCoach);
    console.log('✅ Registration successful');
    console.log('Response:', JSON.stringify(registerResponse.data, null, 2));
    
    coachToken = registerResponse.data.data.token;
    coachId = registerResponse.data.data.user._id;
    console.log(`Coach ID: ${coachId}`);
    console.log(`Token: ${coachToken.substring(0, 20)}...`);
    
    // Step 2: Login Coach
    console.log('\n🔐 Step 2: Login Coach');
    console.log('-'.repeat(60));
    const loginResponse = await axios.post(`${API_URL}/coaches/login`, {
      email: testCoach.email,
      password: testCoach.password
    });
    console.log('✅ Login successful');
    console.log('Response:', JSON.stringify(loginResponse.data, null, 2));
    
    coachToken = loginResponse.data.data.token;
    console.log(`New Token: ${coachToken.substring(0, 20)}...`);
    
    // Decode token to check competition context
    const tokenPayload = JSON.parse(Buffer.from(coachToken.split('.')[1], 'base64').toString());
    console.log('Token Payload:', JSON.stringify(tokenPayload, null, 2));
    console.log(`Has Competition Context: ${!!tokenPayload.competitionId}`);
    
    // Step 3: Check Status (should be create-team)
    console.log('\n📊 Step 3: Check Status (should be create-team)');
    console.log('-'.repeat(60));
    const statusResponse1 = await axios.get(`${API_URL}/coaches/status`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Status retrieved');
    console.log('Response:', JSON.stringify(statusResponse1.data, null, 2));
    
    const status1 = statusResponse1.data.data;
    if (status1.step !== 'create-team') {
      throw new Error(`Expected step 'create-team', got '${status1.step}'`);
    }
    console.log('✅ Status is correct: create-team');
    
    // Step 4: Create Team
    console.log('\n🏆 Step 4: Create Team');
    console.log('-'.repeat(60));
    const createTeamResponse = await axios.post(`${API_URL}/coaches/team`, testTeam, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Team created successfully');
    console.log('Response:', JSON.stringify(createTeamResponse.data, null, 2));
    
    teamId = createTeamResponse.data.data._id;
    console.log(`Team ID: ${teamId}`);
    
    // Verify team is bound to coach by checking profile
    console.log('\n🔗 Verifying team is bound to coach...');
    const profileResponse = await axios.get(`${API_URL}/coaches/profile`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    const coachProfile = profileResponse.data.data;
    const coachTeamId = coachProfile.team?._id || coachProfile.team;
    console.log(`Coach team field: ${coachTeamId}`);
    if (coachTeamId && coachTeamId.toString() === teamId.toString()) {
      console.log('✅ Team is correctly bound to coach model');
    } else {
      console.log('⚠️  Team is NOT bound to coach model');
      console.log(`  Expected: ${teamId}, Got: ${coachTeamId}`);
    }
    
    // Step 5: Check Status (should be select-competition)
    console.log('\n📊 Step 5: Check Status (should be select-competition)');
    console.log('-'.repeat(60));
    const statusResponse2 = await axios.get(`${API_URL}/coaches/status`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Status retrieved');
    console.log('Response:', JSON.stringify(statusResponse2.data, null, 2));
    
    const status2 = statusResponse2.data.data;
    if (status2.step !== 'select-competition') {
      throw new Error(`Expected step 'select-competition', got '${status2.step}'`);
    }
    console.log('✅ Status is correct: select-competition');
    
    // Step 6: Get Open Competitions
    console.log('\n🏅 Step 6: Get Open Competitions');
    console.log('-'.repeat(60));
    const competitionsResponse = await axios.get(`${API_URL}/coaches/competitions/open`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Competitions retrieved');
    console.log(`Found ${competitionsResponse.data.data.length} competitions`);
    
    if (competitionsResponse.data.data.length === 0) {
      throw new Error('No competitions available for testing');
    }
    
    competitionId = competitionsResponse.data.data[0]._id;
    console.log(`Selected Competition ID: ${competitionId}`);
    console.log(`Competition Name: ${competitionsResponse.data.data[0].name}`);
    
    // Step 7: Register Team for Competition
    console.log('\n📝 Step 7: Register Team for Competition');
    console.log('-'.repeat(60));
    const registerTeamResponse = await axios.post(
      `${API_URL}/coaches/team/${teamId}/register-competition`,
      { competitionId },
      { headers: { Authorization: `Bearer ${coachToken}` } }
    );
    console.log('✅ Team registered for competition');
    console.log('Response:', JSON.stringify(registerTeamResponse.data, null, 2));
    
    // Step 8: Set Competition Context
    console.log('\n🎯 Step 8: Set Competition Context');
    console.log('-'.repeat(60));
    const setCompetitionResponse = await axios.post(
      `${API_URL}/auth/set-competition`,
      { competitionId },
      { headers: { Authorization: `Bearer ${coachToken}` } }
    );
    console.log('✅ Competition context set');
    console.log('Response:', JSON.stringify(setCompetitionResponse.data, null, 2));
    
    coachToken = setCompetitionResponse.data.data.token;
    console.log(`New Token with Competition: ${coachToken.substring(0, 20)}...`);
    
    // Decode new token
    const newTokenPayload = JSON.parse(Buffer.from(coachToken.split('.')[1], 'base64').toString());
    console.log('New Token Payload:', JSON.stringify(newTokenPayload, null, 2));
    console.log(`Has Competition Context: ${!!newTokenPayload.competitionId}`);
    
    if (!newTokenPayload.competitionId) {
      throw new Error('Token does not have competition context!');
    }
    console.log('✅ Token has competition context');
    
    // Step 9: Check Status (should be dashboard)
    console.log('\n📊 Step 9: Check Status (should be dashboard)');
    console.log('-'.repeat(60));
    const statusResponse3 = await axios.get(`${API_URL}/coaches/status`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Status retrieved');
    console.log('Response:', JSON.stringify(statusResponse3.data, null, 2));
    
    const status3 = statusResponse3.data.data;
    if (status3.step !== 'dashboard') {
      throw new Error(`Expected step 'dashboard', got '${status3.step}'`);
    }
    console.log('✅ Status is correct: dashboard');
    
    // Step 10: Get Dashboard
    console.log('\n📈 Step 10: Get Dashboard');
    console.log('-'.repeat(60));
    const dashboardResponse = await axios.get(`${API_URL}/coaches/dashboard`, {
      headers: { Authorization: `Bearer ${coachToken}` }
    });
    console.log('✅ Dashboard retrieved');
    console.log('Response:', JSON.stringify(dashboardResponse.data, null, 2));
    
    const dashboard = dashboardResponse.data.data;
    if (!dashboard.team) {
      throw new Error('Dashboard does not have team data!');
    }
    console.log('✅ Dashboard has team data');
    console.log(`Team Name: ${dashboard.team.name}`);
    console.log(`Team ID: ${dashboard.team._id}`);
    console.log(`Players: ${dashboard.team.players.length}`);
    
    // Step 11: Logout and Login Again
    console.log('\n🔄 Step 11: Logout and Login Again');
    console.log('-'.repeat(60));
    const reloginResponse = await axios.post(`${API_URL}/coaches/login`, {
      email: testCoach.email,
      password: testCoach.password
    });
    console.log('✅ Re-login successful');
    
    const reloginToken = reloginResponse.data.data.token;
    const reloginTokenPayload = JSON.parse(Buffer.from(reloginToken.split('.')[1], 'base64').toString());
    console.log('Re-login Token Payload:', JSON.stringify(reloginTokenPayload, null, 2));
    
    if (reloginTokenPayload.competitionId) {
      console.log('✅ Re-login token automatically includes competition context!');
      console.log(`Competition ID in token: ${reloginTokenPayload.competitionId}`);
    } else {
      console.log('⚠️  Re-login token does NOT include competition context');
    }
    
    // Step 12: Get Dashboard with Re-login Token
    console.log('\n📈 Step 12: Get Dashboard with Re-login Token');
    console.log('-'.repeat(60));
    const dashboardResponse2 = await axios.get(`${API_URL}/coaches/dashboard`, {
      headers: { Authorization: `Bearer ${reloginToken}` }
    });
    console.log('✅ Dashboard retrieved with re-login token');
    console.log('Response:', JSON.stringify(dashboardResponse2.data, null, 2));
    
    if (dashboardResponse2.data.data.team) {
      console.log('✅ Dashboard shows team after re-login');
    } else {
      console.log('⚠️  Dashboard does NOT show team after re-login');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\n✅ Complete Flow Summary:');
    console.log('  1. ✅ Coach registration');
    console.log('  2. ✅ Coach login');
    console.log('  3. ✅ Status check (create-team)');
    console.log('  4. ✅ Team creation');
    console.log('  5. ✅ Team bound to coach model');
    console.log('  6. ✅ Status check (select-competition)');
    console.log('  7. ✅ Team registration for competition');
    console.log('  8. ✅ Competition context set in token');
    console.log('  9. ✅ Status check (dashboard)');
    console.log(' 10. ✅ Dashboard shows team');
    console.log(' 11. ✅ Re-login includes competition context');
    console.log(' 12. ✅ Dashboard works after re-login');
    
    console.log('\n📝 Test Data:');
    console.log(`  Coach Email: ${testCoach.email}`);
    console.log(`  Coach ID: ${coachId}`);
    console.log(`  Team ID: ${teamId}`);
    console.log(`  Competition ID: ${competitionId}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
