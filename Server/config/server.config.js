// Get frontend URL for emails (supports both local and deployed frontend)
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

// Get all allowed frontend URLs for CORS
const getAllowedOrigins = () => {
  console.log('🔍 Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_URL: process.env.CLIENT_URL,
    RENDER_FRONTEND_URL: process.env.RENDER_FRONTEND_URL
  });

  // Always include the Render frontend URL (hardcoded for reliability)
  const origins = ['https://mallakhamb-087p.onrender.com'];
  
  // In development or when not in production, also allow localhost
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
    
    // Add client URL (ngrok or other) only in development
    const clientUrl = process.env.CLIENT_URL;
    if (clientUrl && !origins.includes(clientUrl)) {
      origins.push(clientUrl);
    }
  }
  
  console.log('🔗 Final allowed origins:', origins);
  return origins;
};

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  frontendUrl: getFrontendUrl(),
  ngrokEnabled: process.env.NGROK_ENABLED === 'true',
  ngrokToken: process.env.NGROK_AUTH_TOKEN || '',
  getFrontendUrl,
  getAllowedOrigins
};
