// Get frontend URL for emails (supports both local and deployed frontend)
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

// Get all allowed frontend URLs for CORS
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    // Production: only allow Render frontend
    return ['https://mallakhamb-087p.onrender.com'];
  }
  
  // Development: allow localhost and any configured URLs
  const origins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  
  // Add render frontend URL for testing
  if (process.env.RENDER_FRONTEND_URL) {
    origins.push(process.env.RENDER_FRONTEND_URL);
  }
  
  // Add client URL (ngrok or other)
  const clientUrl = process.env.CLIENT_URL;
  if (clientUrl && !origins.includes(clientUrl)) {
    origins.push(clientUrl);
  }
  
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
