const ngrok = require('@ngrok/ngrok');
const config = require('./server.config');

const setupNgrok = async () => {
  try {
    if (!config.ngrokEnabled) {
      console.log('Ngrok disabled by configuration');
      return null;
    }

    if (!config.ngrokToken) {
      console.log('\n⚠️  Ngrok is enabled but no auth token found!');
      console.log('Please add NGROK_AUTH_TOKEN to your .env file');
      console.log('Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken\n');
      return null;
    }

    console.log('Starting ngrok tunnel for backend...');
    
    // Connect using the new @ngrok/ngrok API
    const listener = await ngrok.forward({
      addr: config.port,
      authtoken: config.ngrokToken.trim()
    });

    const url = listener.url();

    console.log('\n========================================');
    console.log('🚀 BACKEND NGROK TUNNEL ACTIVE');
    console.log('========================================');
    console.log(`🎉 Backend URL: ${url}`);
    console.log(`🔗 API URL: ${url}/api`);
    console.log(`🏠 Local URL: http://localhost:${config.port}`);
    console.log('========================================\n');


    // Update environment variables dynamically for email service
    process.env.FRONTEND_URL = url;
    process.env.CLIENT_URL = url;
    
    

    return url;
  } catch (err) {
    console.error('Failed to start ngrok:', err.message);
    
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Verify your auth token from: https://dashboard.ngrok.com/get-started/your-authtoken');
    console.log('2. Check your internet connection');
    console.log('3. Make sure port', config.port, 'is available\n');
    
    console.log('Server will continue running on http://localhost:' + config.port + '\n');
    return null;
  }
};

module.exports = setupNgrok;
