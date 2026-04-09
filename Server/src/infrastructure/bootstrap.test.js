/**
 * Integration tests for application bootstrap
 * 
 * Tests that ConfigManager integrates properly with DI Container
 */

describe('Bootstrap', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set minimal required environment variables
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long';
    process.env.NODE_ENV = 'test';

    // Clear module cache
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  test('should bootstrap application successfully', () => {
    const { bootstrap } = require('./bootstrap');

    const { container, config } = bootstrap();

    expect(container).toBeDefined();
    expect(config).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.database).toBeDefined();
  });

  test('should register config manager in DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    expect(container.has('config')).toBe(true);
  });

  test('should register logger in DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    expect(container.has('logger')).toBe(true);
  });

  test('should resolve config manager from DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const configFromContainer = container.resolve('config');

    expect(configFromContainer).toBeDefined();
    expect(configFromContainer.server.port).toBe(5000);
  });

  test('should resolve logger from DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const logger = container.resolve('logger');

    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(logger.http).toBeDefined();
  });

  test('should return same config instance from container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const config1 = container.resolve('config');
    const config2 = container.resolve('config');

    expect(config1).toBe(config2);
  });

  test('should return same logger instance from container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const logger1 = container.resolve('logger');
    const logger2 = container.resolve('logger');

    expect(logger1).toBe(logger2);
  });

  test('should throw error if required environment variables are missing', () => {
    delete process.env.MONGODB_URI;

    const { bootstrap } = require('./bootstrap');

    expect(() => bootstrap()).toThrow('Required environment variable MONGODB_URI is not set');
  });

  test('should load environment-specific configuration', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '8080';
    process.env.EMAIL_USER = 'test@example.com';
    process.env.EMAIL_PASS = 'password123';
    process.env.CORS_ORIGINS = 'https://example.com,https://app.example.com';

    const { bootstrap } = require('./bootstrap');

    const { config } = bootstrap();

    expect(config.server.nodeEnv).toBe('production');
    expect(config.server.port).toBe(8080);
  });
});
