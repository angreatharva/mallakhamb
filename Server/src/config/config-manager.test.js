/**
 * Unit tests for Configuration Manager
 * 
 * Tests configuration loading, validation, and type conversion
 * Requirements: 5.3, 15.1
 */

describe('ConfigManager', () => {
  let ConfigManager;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to get fresh instance
    jest.resetModules();

    // Set minimal required environment variables
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long';
    process.env.NODE_ENV = 'test';

    // Require fresh instance
    ConfigManager = require('./config-manager');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Configuration Loading', () => {
    test('should load configuration with default values', () => {
      const config = ConfigManager.load();

      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.jwt).toBeDefined();
      expect(config.email).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.cache).toBeDefined();
      expect(config.features).toBeDefined();
    });

    test('should load server configuration', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';

      const config = ConfigManager.load();

      expect(config.server.port).toBe(3000);
      expect(config.server.nodeEnv).toBe('development');
    });

    test('should load database configuration', () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/mydb';
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '50';
      process.env.DB_CONNECT_TIMEOUT = '15000';
      process.env.DB_SOCKET_TIMEOUT = '60000';

      const config = ConfigManager.load();

      expect(config.database.uri).toBe('mongodb://localhost:27017/mydb');
      expect(config.database.poolSize.min).toBe(5);
      expect(config.database.poolSize.max).toBe(50);
      expect(config.database.timeouts.connection).toBe(15000);
      expect(config.database.timeouts.socket).toBe(60000);
    });

    test('should load JWT configuration', () => {
      process.env.JWT_SECRET = 'my-super-secret-jwt-key-with-32-chars';
      process.env.JWT_EXPIRES_IN = '7d';

      const config = ConfigManager.load();

      expect(config.jwt.secret).toBe('my-super-secret-jwt-key-with-32-chars');
      expect(config.jwt.expiresIn).toBe('7d');
    });

    test('should load email configuration for nodemailer', () => {
      process.env.EMAIL_PROVIDER = 'nodemailer';
      process.env.EMAIL_USER = 'test@example.com';
      process.env.EMAIL_PASS = 'password123';
      process.env.EMAIL_HOST = 'smtp.example.com';
      process.env.EMAIL_PORT = '465';

      const config = ConfigManager.load();

      expect(config.email.provider).toBe('nodemailer');
      expect(config.email.nodemailer.user).toBe('test@example.com');
      expect(config.email.nodemailer.password).toBe('password123');
      expect(config.email.nodemailer.host).toBe('smtp.example.com');
      expect(config.email.nodemailer.port).toBe(465);
    });

    test('should load email configuration for resend', () => {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_test_key';
      process.env.RESEND_FROM_EMAIL = 'noreply@example.com';

      const config = ConfigManager.load();

      expect(config.email.provider).toBe('resend');
      expect(config.email.resend.apiKey).toBe('re_test_key');
      expect(config.email.resend.fromEmail).toBe('noreply@example.com');
    });

    test('should load security configuration', () => {
      process.env.BCRYPT_ROUNDS = '10';
      process.env.OTP_LENGTH = '6';
      process.env.OTP_EXPIRY_MINUTES = '15';
      process.env.MAX_LOGIN_ATTEMPTS = '3';
      process.env.LOCKOUT_DURATION_MINUTES = '30';

      const config = ConfigManager.load();

      expect(config.security.bcryptRounds).toBe(10);
      expect(config.security.otpLength).toBe(6);
      expect(config.security.otpExpiry).toBe(15);
      expect(config.security.maxLoginAttempts).toBe(3);
      expect(config.security.lockoutDuration).toBe(30);
    });

    test('should load cache configuration', () => {
      process.env.CACHE_TTL_SECONDS = '600';
      process.env.CACHE_MAX_SIZE = '2000';

      const config = ConfigManager.load();

      expect(config.cache.ttl).toBe(600);
      expect(config.cache.maxSize).toBe(2000);
    });

    test('should load feature flags', () => {
      process.env.ENABLE_CACHING = 'false';
      process.env.ENABLE_METRICS = 'true';
      process.env.NGROK_ENABLED = 'true';
      process.env.NGROK_AUTH_TOKEN = 'test-ngrok-token';

      const config = ConfigManager.load();

      expect(config.features.enableCaching).toBe(false);
      expect(config.features.enableMetrics).toBe(true);
      expect(config.features.enableNgrok).toBe(true);
    });

    test('should return same config instance on multiple calls', () => {
      const config1 = ConfigManager.load();
      const config2 = ConfigManager.load();

      expect(config1).toBe(config2);
    });
  });

  describe('Required Field Validation', () => {
    test('should throw error if MONGODB_URI is missing', () => {
      delete process.env.MONGODB_URI;

      expect(() => ConfigManager.load()).toThrow('Required environment variable MONGODB_URI is not set');
    });

    test('should throw error if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;

      expect(() => ConfigManager.load()).toThrow('Required environment variable JWT_SECRET is not set');
    });

    test('should throw error if JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short';

      expect(() => ConfigManager.load()).toThrow('JWT_SECRET must be at least 32 characters long');
    });

    test('should throw error if PORT is out of range', () => {
      process.env.PORT = '70000';

      expect(() => ConfigManager.load()).toThrow('PORT must be between 1 and 65535');
    });

    test('should throw error if DB_POOL_MAX is less than DB_POOL_MIN', () => {
      process.env.DB_POOL_MIN = '50';
      process.env.DB_POOL_MAX = '10';

      expect(() => ConfigManager.load()).toThrow('DB_POOL_MAX must be greater than or equal to DB_POOL_MIN');
    });

    test('should throw error if DB_CONNECT_TIMEOUT is too low', () => {
      process.env.DB_CONNECT_TIMEOUT = '500';

      expect(() => ConfigManager.load()).toThrow('DB_CONNECT_TIMEOUT must be at least 1000ms');
    });

    test('should throw error if BCRYPT_ROUNDS is out of range', () => {
      process.env.BCRYPT_ROUNDS = '5';

      expect(() => ConfigManager.load()).toThrow('BCRYPT_ROUNDS should be between 10 and 15');
    });

    test('should throw error if OTP_LENGTH is out of range', () => {
      process.env.OTP_LENGTH = '2';

      expect(() => ConfigManager.load()).toThrow('OTP_LENGTH should be between 4 and 8');
    });

    test('should throw error if NGROK is enabled without auth token', () => {
      process.env.NGROK_ENABLED = 'true';
      delete process.env.NGROK_AUTH_TOKEN;

      expect(() => ConfigManager.load()).toThrow('NGROK_AUTH_TOKEN is required when NGROK_ENABLED is true');
    });
  });

  describe('Type Conversion', () => {
    test('getString should return string value', () => {
      process.env.TEST_STRING = 'hello';
      expect(ConfigManager.getString('TEST_STRING')).toBe('hello');
    });

    test('getString should return default if not set', () => {
      expect(ConfigManager.getString('NONEXISTENT', 'default')).toBe('default');
    });

    test('getString should return default if empty string', () => {
      process.env.TEST_EMPTY = '';
      expect(ConfigManager.getString('TEST_EMPTY', 'default')).toBe('default');
    });

    test('getNumber should return number value', () => {
      process.env.TEST_NUMBER = '42';
      expect(ConfigManager.getNumber('TEST_NUMBER')).toBe(42);
    });

    test('getNumber should return default if not set', () => {
      expect(ConfigManager.getNumber('NONEXISTENT', 100)).toBe(100);
    });

    test('getNumber should return default if not a number', () => {
      process.env.TEST_INVALID = 'not-a-number';
      expect(ConfigManager.getNumber('TEST_INVALID', 50)).toBe(50);
    });

    test('getBoolean should return true for "true"', () => {
      process.env.TEST_BOOL = 'true';
      expect(ConfigManager.getBoolean('TEST_BOOL')).toBe(true);
    });

    test('getBoolean should return true for "1"', () => {
      process.env.TEST_BOOL = '1';
      expect(ConfigManager.getBoolean('TEST_BOOL')).toBe(true);
    });

    test('getBoolean should return false for "false"', () => {
      process.env.TEST_BOOL = 'false';
      expect(ConfigManager.getBoolean('TEST_BOOL')).toBe(false);
    });

    test('getBoolean should return default if not set', () => {
      expect(ConfigManager.getBoolean('NONEXISTENT', true)).toBe(true);
    });

    test('getArray should parse comma-separated values', () => {
      process.env.TEST_ARRAY = 'value1,value2,value3';
      expect(ConfigManager.getArray('TEST_ARRAY')).toEqual(['value1', 'value2', 'value3']);
    });

    test('getArray should trim whitespace', () => {
      process.env.TEST_ARRAY = 'value1 , value2 , value3';
      expect(ConfigManager.getArray('TEST_ARRAY')).toEqual(['value1', 'value2', 'value3']);
    });

    test('getArray should return default if not set', () => {
      expect(ConfigManager.getArray('NONEXISTENT', ['default'])).toEqual(['default']);
    });

    test('getArray should filter empty values', () => {
      process.env.TEST_ARRAY = 'value1,,value2,';
      expect(ConfigManager.getArray('TEST_ARRAY')).toEqual(['value1', 'value2']);
    });

    test('getRequired should return value if set', () => {
      process.env.TEST_REQUIRED = 'value';
      expect(ConfigManager.getRequired('TEST_REQUIRED')).toBe('value');
    });

    test('getRequired should throw if not set', () => {
      expect(() => ConfigManager.getRequired('NONEXISTENT')).toThrow('Required environment variable NONEXISTENT is not set');
    });
  });

  describe('Configuration Access', () => {
    test('get should retrieve nested configuration value', () => {
      ConfigManager.load();
      
      expect(ConfigManager.get('server.port')).toBe(5001); // Test setup uses 5001
      expect(ConfigManager.get('database.poolSize.min')).toBe(10);
      expect(ConfigManager.get('jwt.secret')).toBe('test-secret-key-minimum-32-characters-long');
    });

    test('get should return undefined for non-existent path', () => {
      ConfigManager.load();
      
      expect(ConfigManager.get('nonexistent.path')).toBeUndefined();
    });

    test('get should throw if config not loaded', () => {
      // Create new instance without loading
      jest.resetModules();
      const FreshConfigManager = require('./config-manager');
      
      expect(() => FreshConfigManager.get('server.port')).toThrow('Configuration not loaded');
    });

    test('getAll should return complete configuration', () => {
      const config = ConfigManager.load();
      const all = ConfigManager.getAll();

      expect(all).toEqual(config);
    });

    test('getAll should return deep copy to prevent modification', () => {
      ConfigManager.load();
      const all = ConfigManager.getAll();
      
      all.server.port = 9999;
      
      expect(ConfigManager.get('server.port')).not.toBe(9999);
    });
  });

  describe('Environment Helpers', () => {
    test('isDevelopment should return true in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const DevConfigManager = require('./config-manager');
      
      expect(DevConfigManager.isDevelopment()).toBe(true);
      expect(DevConfigManager.isProduction()).toBe(false);
      expect(DevConfigManager.isTest()).toBe(false);
    });

    test('isProduction should return true in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const ProdConfigManager = require('./config-manager');
      
      expect(ProdConfigManager.isProduction()).toBe(true);
      expect(ProdConfigManager.isDevelopment()).toBe(false);
      expect(ProdConfigManager.isTest()).toBe(false);
    });

    test('isTest should return true in test', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const TestConfigManager = require('./config-manager');
      
      expect(TestConfigManager.isTest()).toBe(true);
      expect(TestConfigManager.isDevelopment()).toBe(false);
      expect(TestConfigManager.isProduction()).toBe(false);
    });
  });

  describe('Default CORS Origins', () => {
    test('should return empty array in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const ProdConfigManager = require('./config-manager');
      
      const origins = ProdConfigManager.getDefaultCorsOrigins();
      expect(origins).toEqual([]);
    });

    test('should return localhost origins in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const DevConfigManager = require('./config-manager');
      
      const origins = DevConfigManager.getDefaultCorsOrigins();
      expect(origins).toContain('http://localhost:5173');
      expect(origins).toContain('http://localhost:3000');
    });
  });
});
