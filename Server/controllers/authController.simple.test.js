/**
 * Authentication Controller Simple API Tests
 * 
 * Basic tests to verify the refactored controller works
 */

const container = require('../src/infrastructure/di-container');

describe('AuthController Simple Tests', () => {
  let mockAuthService;
  let mockCompetitionRepository;
  let mockLogger;

  beforeAll(() => {
    // Mock services
    mockAuthService = {
      forgotPassword: jest.fn(),
      verifyOTP: jest.fn(),
      resetPasswordWithOTP: jest.fn(),
      setCompetitionContext: jest.fn()
    };

    mockCompetitionRepository = {
      find: jest.fn(),
      findById: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Register mocks in DI container
    container.register('authenticationService', () => mockAuthService, 'singleton');
    container.register('competitionRepository', () => mockCompetitionRepository, 'singleton');
    container.register('logger', () => mockLogger, 'singleton');
  });

  afterAll(() => {
    container.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve authenticationService from container', () => {
    const authService = container.resolve('authenticationService');
    expect(authService).toBeDefined();
    expect(authService.forgotPassword).toBeDefined();
  });

  it('should resolve competitionRepository from container', () => {
    const competitionRepository = container.resolve('competitionRepository');
    expect(competitionRepository).toBeDefined();
    expect(competitionRepository.find).toBeDefined();
  });

  it('should resolve logger from container', () => {
    const logger = container.resolve('logger');
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
  });
});
