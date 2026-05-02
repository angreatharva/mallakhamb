require('dotenv').config();
const Razorpay = require('razorpay');

async function testRazorpay() {
  console.log('\n=== Testing Razorpay Configuration ===\n');

  // Check environment variables
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  console.log('1. Checking environment variables:');
  console.log('   RAZORPAY_KEY_ID:', keyId ? `${keyId.substring(0, 15)}...` : 'NOT SET');
  console.log('   RAZORPAY_KEY_SECRET:', keySecret ? '****** (set)' : 'NOT SET');

  if (!keyId || !keySecret) {
    console.log('\n❌ ERROR: Razorpay credentials not configured in .env file');
    return;
  }

  console.log('\n2. Creating Razorpay instance...');
  const razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
  console.log('   ✓ Razorpay instance created');

  console.log('\n3. Testing API connection by creating a test order...');
  try {
    const order = await razorpay.orders.create({
      amount: 60000, // ₹600 in paise
      currency: 'INR',
      receipt: `test_receipt_${Date.now()}`,
      notes: {
        test: 'true',
        purpose: 'API connection test'
      }
    });

    console.log('   ✓ Order created successfully!');
    console.log('\n   Order Details:');
    console.log('   - Order ID:', order.id);
    console.log('   - Amount:', order.amount / 100, 'INR');
    console.log('   - Currency:', order.currency);
    console.log('   - Status:', order.status);
    console.log('   - Created at:', new Date(order.created_at * 1000).toLocaleString());

    console.log('\n✅ Razorpay integration is working correctly!');
    console.log('\nYou can view this test order in your Razorpay dashboard:');
    console.log('https://dashboard.razorpay.com/app/orders');

  } catch (error) {
    console.log('   ❌ Failed to create order');
    console.log('\n   Error Details:');
    console.log('   - Message:', error.message);
    console.log('   - Status Code:', error.statusCode);
    
    if (error.error) {
      console.log('   - Razorpay Error:', JSON.stringify(error.error, null, 2));
    }

    console.log('\n   Possible causes:');
    console.log('   1. Invalid API credentials (check your Razorpay dashboard)');
    console.log('   2. API keys are for wrong mode (test vs live)');
    console.log('   3. Network/firewall blocking Razorpay API');
    console.log('   4. Razorpay account not activated');
    
    console.log('\n   Full error:');
    console.log(error);
  }
}

testRazorpay();
