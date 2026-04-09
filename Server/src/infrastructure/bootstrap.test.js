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

  test('should register all repositories in DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    expect(container.has('playerRepository')).toBe(true);
    expect(container.has('coachRepository')).toBe(true);
    expect(container.has('adminRepository')).toBe(true);
    expect(container.has('judgeRepository')).toBe(true);
    expect(container.has('competitionRepository')).toBe(true);
    expect(container.has('teamRepository')).toBe(true);
    expect(container.has('scoreRepository')).toBe(true);
    expect(container.has('transactionRepository')).toBe(true);
  });

  test('should resolve repositories from DI container', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const playerRepo = container.resolve('playerRepository');
    const coachRepo = container.resolve('coachRepository');
    const adminRepo = container.resolve('adminRepository');
    const judgeRepo = container.resolve('judgeRepository');
    const competitionRepo = container.resolve('competitionRepository');
    const teamRepo = container.resolve('teamRepository');
    const scoreRepo = container.resolve('scoreRepository');
    const transactionRepo = container.resolve('transactionRepository');

    expect(playerRepo).toBeDefined();
    expect(coachRepo).toBeDefined();
    expect(adminRepo).toBeDefined();
    expect(judgeRepo).toBeDefined();
    expect(competitionRepo).toBeDefined();
    expect(teamRepo).toBeDefined();
    expect(scoreRepo).toBeDefined();
    expect(transactionRepo).toBeDefined();
  });

  test('should inject logger into repositories', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const playerRepo = container.resolve('playerRepository');
    const logger = container.resolve('logger');

    expect(playerRepo.logger).toBeDefined();
    expect(playerRepo.logger).toBe(logger);
  });

  test('should return same repository instance from container (singleton)', () => {
    const { bootstrap } = require('./bootstrap');

    const { container } = bootstrap();

    const playerRepo1 = container.resolve('playerRepository');
    const playerRepo2 = container.resolve('playerRepository');

    expect(playerRepo1).toBe(playerRepo2);
  });
});
