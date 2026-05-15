/**
 * Test script to verify player profile API returns age group from competition registrations
 */

const axios = require('axios');

async function testPlayerProfile() {
  try {
    console.log('Testing player profile API...');
    
    // First, login as the player to get a token
    const loginResponse = await axios.post('http://localhost:5000/api/players/login', {
      email: 'atharva@gmail.com',
      password: 'Password123!'
    });
    
    const token = loginResponse.data.data.token;
    console.log('Login successful, token obtained');
    
    // Now get the player profile
    const profileResponse = await axios.get('http://localhost:5000/api/players/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Player Profile Response:');
    console.log(JSON.stringify(profileResponse.data, null, 2));
    
    // Check if ageGroup is populated
    const ageGroup = profileResponse.data.data.ageGroup;
    if (ageGroup) {
      console.log(`✅ SUCCESS: Age group is populated: ${ageGroup}`);
    } else {
      console.log('❌ FAILED: Age group is still null');
    }
    
  } catch (error) {
    console.error('Error testing player profile:', error.response?.data || error.message);
  }
}

testPlayerProfile();