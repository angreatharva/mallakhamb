/**
 * Environment Variable Validation Utility
 * Validates required environment variables on startup
 */

const validateEnvironment = () => {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated successfully');
};

module.exports = { validateEnvironment };
