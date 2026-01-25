const fs = require('fs');
const path = require('path');

/**
 * Ngrok URL Management Utilities
 * Provides functions to manage and retrieve ngrok URLs across the application
 */

/**
 * Get the current ngrok URL from the shared file
 * @returns {Object|null} Ngrok info object or null if not available
 */
function getNgrokInfo() {
  try {
    const ngrokInfoPath = path.join(__dirname, '..', '..', 'Web', 'public', 'ngrok-url.json');
    if (fs.existsSync(ngrokInfoPath)) {
      const ngrokInfo = JSON.parse(fs.readFileSync(ngrokInfoPath, 'utf8'));
      return ngrokInfo;
    }
  } catch (err) {
    console.log('Could not read ngrok info:', err.message);
  }
  return null;
}

/**
 * Get the current ngrok URL
 * @returns {string|null} Ngrok URL or null if not available
 */
function getNgrokUrl() {
  const info = getNgrokInfo();
  return info ? info.url : null;
}

/**
 * Get the current ngrok API URL
 * @returns {string|null} Ngrok API URL or null if not available
 */
function getNgrokApiUrl() {
  const info = getNgrokInfo();
  return info ? info.apiUrl : null;
}

/**
 * Check if ngrok is currently active
 * @returns {boolean} True if ngrok is active, false otherwise
 */
function isNgrokActive() {
  const info = getNgrokInfo();
  if (!info) return false;
  
  // Check if the timestamp is recent (within last 5 minutes)
  const timestamp = new Date(info.timestamp);
  const now = new Date();
  const diffMinutes = (now - timestamp) / (1000 * 60);
  
  return diffMinutes < 5;
}

/**
 * Get all allowed origins for CORS (including ngrok URL if active)
 * @returns {string[]} Array of allowed origins
 */
function getAllowedOrigins() {
  const origins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  
  const ngrokUrl = getNgrokUrl();
  if (ngrokUrl && !origins.includes(ngrokUrl)) {
    origins.push(ngrokUrl);
  }
  
  return origins;
}

/**
 * Get the frontend URL (always local since frontend doesn't use ngrok)
 * @returns {string} Frontend URL to use
 */
function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

/**
 * Log current URL configuration
 */
function logUrlConfiguration() {
  const ngrokInfo = getNgrokInfo();
  
  console.log('\n📡 URL Configuration:');
  console.log('==========================================');
  
  if (ngrokInfo) {
    console.log('🌐 Ngrok Status: ACTIVE');
    console.log(`🔗 Public URL: ${ngrokInfo.url}`);
    console.log(`🔗 API URL: ${ngrokInfo.apiUrl}`);
    console.log(`⏰ Last Updated: ${new Date(ngrokInfo.timestamp).toLocaleString()}`);
  } else {
    console.log('🏠 Ngrok Status: NOT ACTIVE');
    console.log('🔗 Using Local URLs');
  }
  
  console.log(`🎯 Frontend URL: ${getFrontendUrl()}`);
  console.log(`🔒 CORS Origins: ${getAllowedOrigins().join(', ')}`);
  console.log('==========================================\n');
}

module.exports = {
  getNgrokInfo,
  getNgrokUrl,
  getNgrokApiUrl,
  isNgrokActive,
  getAllowedOrigins,
  getFrontendUrl,
  logUrlConfiguration
};