// Get frontend URL for emails (always local since frontend doesn't use ngrok)
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  frontendUrl: getFrontendUrl(),
  ngrokEnabled: process.env.NGROK_ENABLED === 'true',
  ngrokToken: process.env.NGROK_AUTH_TOKEN || '',
  getFrontendUrl
};
