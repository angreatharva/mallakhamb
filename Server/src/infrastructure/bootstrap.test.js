/**
 * Bootstrap Module Tests
 * 
 * Tests for the bootstrap module to ensure all services are registered correctly
 */

// Mock the config manager before importing bootstrap (real module is a ConfigManager-like singleton)
jest.mock('../config/config-manager', () => {
  const mockConfigState = {
    server: {
      port: 5000,
      nodeEnv: 'test',
      corsOrigins: []
    },
    database: {
      uri: 'mongodb://localhost:27017/test',
      poolSize: { min: 10, max: 100 },
      timeouts: { connection: 10000, socket: 45000 }
    },
    jwt: {
      secret: 'test-secret-32-characters-minimum!',
      expiresIn: '24h'
    },
    email: {
      provider: 'nodemailer',
      from: 'test@example.com',
      nodemailer: {
        host: 'smtp.test.com',
        port: 587,
        user: 'test',
        password: 'test'
      },
      resend: {
        apiKey: '',
        fromEmail: ''
      }
    },
    security: {
      bcryptRounds: 10,
      otpLength: 6,
      otpExpiry: 10,
      maxLoginAttempts: 5,
      lockoutDuration: 15
    },
    cache: {
      ttl: 300,
      maxSize: 1000
    },
    features: {
      enableCaching: true,
      enableMetrics: true,
      enableNgrok: false
    }
  };

  const get = jest.fn((path) => {
    const keys = path.split('.');
    let value = mockConfigState;
    for (const key of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[key];
    }
    return value;
  });

  return {
    load: jest.fn(() => mockConfigState),
    get
  };
});

const { bootstrap } = require('./bootstrap');

describe('Bootstrap Module', () => {
  let container;
  let config;

  beforeAll(() => {
    const result = bootstrap();
    container = result.container;
    config = result.config;
  });

  describe('Infrastructure Services', () => {
    test('should register config', () => {
      const resolvedConfig = container.resolve('config');
      expect(resolvedConfig).toBeDefined();
      expect(resolvedConfig).toBe(config);
    });

    test('should register logger', () => {
      const logger = container.resolve('logger');
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });
  });

  describe('Repository Registration', () => {
    test('should register playerRepository', () => {
      const repo = container.resolve('playerRepository');
      expect(repo).toBeDefined();
      expect(repo.create).toBeDefined();
      expect(repo.findById).toBeDefined();
    });

    test('should register coachRepository', () => {
      const repo = container.resolve('coachRepository');
      expect(repo).toBeDefined();
    });

    test('should register adminRepository', () => {
      const repo = container.resolve('adminRepository');
      expect(repo).toBeDefined();
    });

    test('should register judgeRepository', () => {
      const repo = container.resolve('judgeRepository');
      expect(repo).toBeDefined();
    });

    test('should register competitionRepository', () => {
      const repo = container.resolve('competitionRepository');
      expect(repo).toBeDefined();
    });

    test('should register teamRepository', () => {
      const repo = container.resolve('teamRepository');
      expect(repo).toBeDefined();
    });

    test('should register scoreRepository', () => {
      const repo = container.resolve('scoreRepository');
      expect(repo).toBeDefined();
    });

    test('should register transactionRepository', () => {
      const repo = container.resolve('transactionRepository');
      expect(repo).toBeDefined();
    });
  });

  describe('Service Registration', () => {
    test('should register cacheService', () => {
      const service = container.resolve('cacheService');
      expect(service).toBeDefined();
      expect(service.get).toBeDefined();
      expect(service.set).toBeDefined();
      expect(service.delete).toBeDefined();
    });

    test('should register emailService', () => {
      const service = container.resolve('emailService');
      expect(service).toBeDefined();
    });

    test('should register tokenService', () => {
      const service = container.resolve('tokenService');
      expect(service).toBeDefined();
      expect(service.generateToken).toBeDefined();
      expect(service.verifyToken).toBeDefined();
    });

    test('should register otpService', () => {
      const service = container.resolve('otpService');
      expect(service).toBeDefined();
    });

    test('should register authenticationService', () => {
      const service = container.resolve('authenticationService');
      expect(service).toBeDefined();
      expect(service.login).toBeDefined();
      expect(service.register).toBeDefined();
    });

    test('should register authorizationService', () => {
      const service = container.resolve('authorizationService');
      expect(service).toBeDefined();
    });

    test('should register playerService', () => {
      const service = container.resolve('playerService');
      expect(service).toBeDefined();
      expect(service.getProfile).toBeDefined();
      expect(service.updateProfile).toBeDefined();
    });

    test('should register coachService', () => {
      const service = container.resolve('coachService');
      expect(service).toBeDefined();
      expect(service.getProfile).toBeDefined();
    });

    test('should register adminService', () => {
      const service = container.resolve('adminService');
      expect(service).toBeDefined();
      expect(service.getProfile).toBeDefined();
    });

    test('should register competitionService', () => {
      const service = container.resolve('competitionService');
      expect(service).toBeDefined();
      expect(service.createCompetition).toBeDefined();
      expect(service.getCompetitionById).toBeDefined();
    });

    test('should register registrationService', () => {
      const service = container.resolve('registrationService');
      expect(service).toBeDefined();
      expect(service.registerTeam).toBeDefined();
      expect(service.unregisterTeam).toBeDefined();
    });

    test('should register teamService', () => {
      const service = container.resolve('teamService');
      expect(service).toBeDefined();
      expect(service.createTeam).toBeDefined();
      expect(service.getTeamById).toBeDefined();
    });

    test('should register calculationService', () => {
      const service = container.resolve('calculationService');
      expect(service).toBeDefined();
      expect(service.calculateExecutionAverage).toBeDefined();
      expect(service.calculateFinalScore).toBeDefined();
    });

    test('should register scoringService', () => {
      const service = container.resolve('scoringService');
      expect(service).toBeDefined();
      expect(service.submitScore).toBeDefined();
      expect(service.getScoreById).toBeDefined();
    });
  });

  describe('Dependency Injection', () => {
    test('should inject logger into repositories', () => {
      const repo = container.resolve('playerRepository');
      expect(repo.logger).toBeDefined();
    });

    test('should inject dependencies into services', () => {
      const service = container.resolve('playerService');
      expect(service.repository).toBeDefined();
      expect(service.teamRepository).toBeDefined();
      expect(service.logger).toBeDefined();
    });

    test('should resolve same singleton instance on multiple calls', () => {
      const logger1 = container.resolve('logger');
      const logger2 = container.resolve('logger');
      expect(logger1).toBe(logger2);
    });

    test('should wire complex service dependencies correctly', () => {
      const authService = container.resolve('authenticationService');
      expect(authService).toBeDefined();
      
      // Verify all dependencies are injected
      expect(authService.playerRepository).toBeDefined();
      expect(authService.coachRepository).toBeDefined();
      expect(authService.adminRepository).toBeDefined();
      expect(authService.judgeRepository).toBeDefined();
      expect(authService.competitionRepository).toBeDefined();
      expect(authService.tokenService).toBeDefined();
      expect(authService.otpService).toBeDefined();
      expect(authService.logger).toBeDefined();
    });
  });

  describe('Service Dependencies', () => {
    test('competitionService should have cacheService dependency', () => {
      const service = container.resolve('competitionService');
      expect(service.cacheService).toBeDefined();
    });

    test('teamService should have all required dependencies', () => {
      const service = container.resolve('teamService');
      expect(service.teamRepository).toBeDefined();
      expect(service.playerRepository).toBeDefined();
      expect(service.competitionRepository).toBeDefined();
      expect(service.cacheService).toBeDefined();
      expect(service.logger).toBeDefined();
    });

    test('scoringService should have all required dependencies', () => {
      const service = container.resolve('scoringService');
      expect(service.scoreRepository).toBeDefined();
      expect(service.competitionRepository).toBeDefined();
      expect(service.playerRepository).toBeDefined();
      expect(service.judgeRepository).toBeDefined();
      expect(service.logger).toBeDefined();
    });
  });

  describe('Controller Registration', () => {
    test('should register competitionController', () => {
      const controller = container.resolve('competitionController');
      expect(controller).toBeDefined();
      expect(controller.competitionService).toBeDefined();
      expect(controller.registrationService).toBeDefined();
      expect(controller.logger).toBeDefined();
    });

    test('should register teamController', () => {
      const controller = container.resolve('teamController');
      expect(controller).toBeDefined();
      expect(controller.teamService).toBeDefined();
      expect(controller.logger).toBeDefined();
    });

    test('should register healthController', () => {
      const controller = container.resolve('healthController');
      expect(controller).toBeDefined();
      expect(controller.healthMonitor).toBeDefined();
      expect(controller.metricsCollector).toBeDefined();
      expect(controller.logger).toBeDefined();
    });

    test('should register coachController', () => {
      const controller = container.resolve('coachController');
      expect(controller).toBeDefined();
      // Coach controller is a functional module, so it should have exported functions
      expect(typeof controller.registerCoach).toBe('function');
      expect(typeof controller.loginCoach).toBe('function');
      expect(typeof controller.getCoachProfile).toBe('function');
    });
  });
});
