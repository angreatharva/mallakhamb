require('dotenv').config();
const ConfigManager = require('../src/config/config-manager');

console.log('\n=== Testing Config Service ===\n');

const config = new ConfigManager();

console.log('1. Testing razorpay.keyId:');
const keyId = config.get('razorpay.keyId');
console.log('   Value:', keyId ? `${keyId.substring(0, 15)}...` : 'NOT FOUND');

console.log('\n2. Testing razorpay.keySecret:');
const keySecret = config.get('razorpay.keySecret');
console.log('   Value:', keySecret ? '****** (found)' : 'NOT FOUND');

console.log('\n3. Direct env check:');
console.log('   RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'SET' : 'NOT SET');
console.log('   RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'NOT SET');

if (keyId && keySecret) {
  console.log('\n✅ Config service is working correctly!');
} else {
  console.log('\n❌ Config service is NOT returning Razorpay credentials!');
}
