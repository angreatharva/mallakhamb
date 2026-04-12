/**
 * Jest global setup
 * Sets up test environment variables
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '24h';
process.env.BCRYPT_ROUNDS = '10';
process.env.PORT = '5001';
process.env.EMAIL_PROVIDER = 'nodemailer';
process.env.EMAIL_FROM = 'test@example.com';
process.env.EMAIL_HOST = 'smtp.example.com';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASSWORD = 'test-password';
process.env.OTP_LENGTH = '6';
process.env.OTP_EXPIRY_MINUTES = '10';
process.env.MAX_LOGIN_ATTEMPTS = '5';
process.env.LOCKOUT_DURATION_MINUTES = '15';
process.env.CACHE_TTL_SECONDS = '300';
process.env.CACHE_MAX_SIZE = '1000';
process.env.ENABLE_CACHING = 'true';
process.env.ENABLE_METRICS = 'false';
process.env.ENABLE_NGROK = 'false';
