require('dotenv').config();
const mongoose = require('mongoose');
const bootstrap = require('../src/infrastructure/bootstrap');

async function testPaymentOrder() {
  try {
    console.log('\n=== Testing Payment Order Creation ===\n');

    // Bootstrap the application
    const container = bootstrap();
    console.log('✓ Application bootstrapped');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Get services
    const coachService = container.resolve('coachService');
    const config = container.resolve('config');

    console.log('\n1. Testing config service:');
    const keyId = config.get('razorpay.keyId');
    const keySecret = config.get('razorpay.keySecret');
    console.log('   Key ID:', keyId ? `${keyId.substring(0, 15)}...` : 'EMPTY');
    console.log('   Key Secret:', keySecret ? '****** (set)' : 'EMPTY');

    console.log('\n2. Creating payment order:');
    const coachId = '69f0e75060dca219cd5246d0';
    const competitionId = '69ef7a214bdc94418e56bdb0';

    const order = await coachService.createTeamPaymentOrder(coachId, competitionId);

    console.log('   ✓ Order created successfully!');
    console.log('\n   Order Details:');
    console.log('   - Order ID:', order.order.id);
    console.log('   - Amount:', order.order.amount, 'INR');
    console.log('   - Currency:', order.order.currency);
    console.log('   - Team:', order.team.name);
    console.log('   - Player Count:', order.team.playerCount);
    console.log('   - Razorpay Key ID:', order.razorpayKeyId ? `${order.razorpayKeyId.substring(0, 15)}...` : 'EMPTY');

    console.log('\n✅ Payment order creation is working!');

  } catch (error) {
    console.log('\n❌ Error creating payment order:');
    console.log('   Message:', error.message);
    console.log('   Stack:', error.stack);
    
    if (error.error) {
      console.log('   Razorpay Error:', JSON.stringify(error.error, null, 2));
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testPaymentOrder();
