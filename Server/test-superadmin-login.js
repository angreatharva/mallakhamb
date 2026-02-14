// Test super admin login
require('dotenv').config();
const axios = require('axios');

const testSuperAdminLogin = async () => {
  try {
    console.log('🧪 Testing Super Admin Login...');
    console.log('📍 API URL: http://localhost:5000/api/superadmin/login');
    
    const response = await axios.post('http://localhost:5000/api/superadmin/login', {
      email: 'angreatharva08@gmail.com',
      password: 'Atharva08'
    });

    console.log('✅ Login successful!');
    console.log('Token:', response.data.token);
    console.log('Admin:', response.data.admin);

    // Test system-stats endpoint with the token
    console.log('\n🧪 Testing system-stats endpoint...');
    const statsResponse = await axios.get('http://localhost:5000/api/superadmin/system-stats', {
      headers: {
        'Authorization': `Bearer ${response.data.token}`
      }
    });

    console.log('✅ System stats retrieved successfully!');
    console.log('Stats:', JSON.stringify(statsResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
};

testSuperAdminLogin();
