const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testAdminAuth() {
  try {
    console.log('🧪 Testing Admin Authentication Flow...\n');
    
    // Step 1: Login
    console.log('1️⃣ Attempting admin login...');
    const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
      email: 'admin@example.com', // Replace with actual admin email
      password: 'password123' // Replace with actual password
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 20) + '...\n');
    
    // Step 2: Test Dashboard endpoint
    console.log('2️⃣ Testing dashboard endpoint...');
    const dashboardResponse = await axios.get(`${BASE_URL}/admin/dashboard`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'http://localhost:5173'
      }
    });
    
    console.log('✅ Dashboard request successful!');
    console.log('Dashboard data:', JSON.stringify(dashboardResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testAdminAuth();
