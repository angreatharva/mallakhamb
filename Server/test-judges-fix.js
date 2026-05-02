/**
 * Test script to verify the judges endpoint fix
 * This script tests that admin judges endpoint now works consistently with superadmin
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

async function testJudgesFix() {
  try {
    console.log('🧪 Testing Judges Endpoint Fix');
    console.log('='.repeat(50));

    // Test data - you'll need to replace these with actual values from your system
    const ADMIN_TOKEN = 'your-admin-token-here'; // Replace with actual admin token
    const SUPERADMIN_TOKEN = 'your-superadmin-token-here'; // Replace with actual superadmin token
    const COMPETITION_ID = '69ef7a214bdc94418e56bdb0'; // From your original request

    const testParams = {
      gender: 'Male',
      ageGroup: 'Above18',
      competitionTypes: 'competition_1'
    };

    console.log('\n1. Testing Admin Endpoint (should now require competition context)');
    console.log('-'.repeat(50));
    
    try {
      // This should fail without competition context
      const adminResponse = await axios.get(`${API_URL}/admin/judges`, {
        params: testParams,
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
      });
      console.log('❌ Admin endpoint should have failed without competition context');
    } catch (error) {
      if (error.response?.status === 400 && 
          error.response?.data?.error?.code === 'COMPETITION_CONTEXT_REQUIRED') {
        console.log('✅ Admin endpoint correctly requires competition context');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n2. Testing Admin Endpoint with Competition Context');
    console.log('-'.repeat(50));
    
    try {
      // This should work with competition context in header
      const adminResponse = await axios.get(`${API_URL}/admin/judges`, {
        params: testParams,
        headers: { 
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          'x-competition-id': COMPETITION_ID
        }
      });
      console.log('✅ Admin endpoint works with competition context');
      console.log(`Found ${adminResponse.data.data.length} judges`);
    } catch (error) {
      console.log('❌ Admin endpoint failed with competition context:', error.message);
    }

    console.log('\n3. Testing SuperAdmin Endpoint (should still work)');
    console.log('-'.repeat(50));
    
    try {
      const superadminResponse = await axios.get(`${API_URL}/superadmin/judges`, {
        params: { ...testParams, competition: COMPETITION_ID },
        headers: { Authorization: `Bearer ${SUPERADMIN_TOKEN}` }
      });
      console.log('✅ SuperAdmin endpoint still works');
      console.log(`Found ${superadminResponse.data.data.length} judges`);
    } catch (error) {
      console.log('❌ SuperAdmin endpoint failed:', error.message);
    }

    console.log('\n🎉 Test completed!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  console.log('⚠️  Please update the tokens and competition ID in this script before running');
  console.log('This is a template script to verify the fix works correctly');
  // testJudgesFix();
}

module.exports = testJudgesFix;