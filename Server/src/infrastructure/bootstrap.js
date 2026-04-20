const container = require('./di-container');
const configManager = require('../config/config-manager');
const Logger = require('./logger');

const PlayerRepository = require('../repositories/player.repository');
const CoachRepository = require('../repositories/coach.repository');
const AdminRepository = require('../repositories/admin.repository');
const JudgeRepository = require('../repositories/judge.repository');
const CompetitionRepository = require('../repositories/competition.repository');
const TeamRepository = require('../repositories/team.repository');
const ScoreRepository = require('../repositories/score.repository');
const TransactionRepository = require('../repositories/transaction.repository');

const CacheService = require('../services/cache/cache.service');
const CacheWarmer = require('../services/cache/cache-warmer');
const EmailService = require('../services/email/email.service');
const TokenService = require('../services/auth/token.service');
const OTPService = require('../services/auth/otp.service');
const AuthenticationService = require('../services/auth/authentication.service');
const AuthorizationService = require('../services/auth/authorization.service');
const PlayerService = require('../services/user/player.service');
const CoachService = require('../services/user/coach.service');
const AdminService = require('../services/user/admin.service');
const SuperAdminService = require('../services/user/super-admin.service');
const CompetitionService = require('../services/competition/competition.service');
const RegistrationService = require('../services/competition/registration.service');
const TeamService = require('../services/team/team.service');
const ScoringService = require('../services/scoring/scoring.service');
const CalculationService = require('../services/scoring/calculation.service');
const FeatureFlagService = require('../services/feature-flags/feature-flag.service');
const PaymentService = require('../services/payment/payment.service');

const createCompetitionController = require('../controllers/competition.controller');
const createTeamController = require('../controllers/team.controller');
const HealthController = require('../controllers/health.controller');
const createCoachController = require('../controllers/coach.controller');
const createAdminController = require('../controllers/admin.controller');
const createAuthController = require('../controllers/auth.controller');
const createPlayerController = require('../controllers/player.controller');
const createJudgeController = require('../controllers/judge.controller');
const createSuperAdminController = require('../controllers/super_admin.controller');
const createPaymentController = require('../controllers/payment.controller');

const HealthMonitor = require('./health-monitor');
const MetricsCollector = require('./metrics-collector');
const GracefulShutdownHandler = require('./graceful-shutdown');
const DatabaseConnection = require('./database/connection');

const SocketManager = require('../socket/socket.manager');
const ScoringHandler = require('../socket/handlers/scoring.handler');
const NotificationHandler = require('../socket/handlers/notification.handler');
const RequestCoalescingMiddleware = require('../middleware/request-coalescing.middleware');

function bootstrap() {
  configManager.load();
  container.register('config', () => configManager, 'singleton');
  container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');
  container.register('databaseConnection', (c) => new DatabaseConnection(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('metricsCollector', (c) => new MetricsCollector(c.resolve('logger')), 'singleton');
  container.register('emailService', (c) => new EmailService(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('healthMonitor', (c) => new HealthMonitor(c.resolve('config'), c.resolve('logger'), c.resolve('emailService')), 'singleton');
  container.register('gracefulShutdownHandler', (c) => new GracefulShutdownHandler(c.resolve('logger'), c.resolve('config')), 'singleton');
  container.register('requestCoalescingMiddleware', (c) => new RequestCoalescingMiddleware(c.resolve('logger')), 'singleton');

  container.register('playerRepository', (c) => new PlayerRepository(c.resolve('logger')), 'singleton');
  container.register('coachRepository', (c) => new CoachRepository(c.resolve('logger')), 'singleton');
  container.register('adminRepository', (c) => new AdminRepository(c.resolve('logger')), 'singleton');
  container.register('judgeRepository', (c) => new JudgeRepository(c.resolve('logger')), 'singleton');
  container.register('competitionRepository', (c) => new CompetitionRepository(c.resolve('logger')), 'singleton');
  container.register('teamRepository', (c) => new TeamRepository(c.resolve('logger')), 'singleton');
  container.register('scoreRepository', (c) => new ScoreRepository(c.resolve('logger')), 'singleton');
  container.register('transactionRepository', (c) => new TransactionRepository(c.resolve('logger')), 'singleton');

  container.register('cacheService', (c) => new CacheService(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('featureFlagService', (c) => new FeatureFlagService(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('tokenService', (c) => new TokenService(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('otpService', (c) => new OTPService(
    c.resolve('config'),
    c.resolve('logger'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('emailService')
  ), 'singleton');
  container.register('authenticationService', (c) => new AuthenticationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('tokenService'),
    c.resolve('otpService'),
    c.resolve('logger')
  ), 'singleton');
  container.register('authorizationService', (c) => new AuthorizationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
  container.register('paymentService', (c) => new PaymentService(c.resolve('config'), c.resolve('logger'), c.resolve('transactionRepository')), 'singleton');

  container.register('playerService', (c) => new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService'),
    c.resolve('authenticationService')
  ), 'singleton');
  container.register('coachService', (c) => new CoachService(
    c.resolve('coachRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService'),
    c.resolve('authenticationService'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository')
  ), 'singleton');
  container.register('calculationService', (c) => new CalculationService(c.resolve('logger')), 'singleton');
  container.register('adminService', (c) => new AdminService({
    adminRepository: c.resolve('adminRepository'),
    playerRepository: c.resolve('playerRepository'),
    coachRepository: c.resolve('coachRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    teamRepository: c.resolve('teamRepository'),
    judgeRepository: c.resolve('judgeRepository'),
    scoreRepository: c.resolve('scoreRepository'),
    transactionRepository: c.resolve('transactionRepository'),
    calculationService: c.resolve('calculationService'),
    socketManager: null,
    logger: c.resolve('logger'),
    cacheService: c.resolve('cacheService'),
  }), 'singleton');
  container.register('superAdminService', (c) => new SuperAdminService({
    authenticationService: c.resolve('authenticationService'),
    adminRepository: c.resolve('adminRepository'),
    coachRepository: c.resolve('coachRepository'),
    teamRepository: c.resolve('teamRepository'),
    judgeRepository: c.resolve('judgeRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    transactionRepository: c.resolve('transactionRepository'),
    logger: c.resolve('logger'),
  }), 'singleton');
  container.register('judgeService', (c) => {
    const JudgeService = require('../services/user/judge.service');
    return new JudgeService({
      judgeRepository: c.resolve('judgeRepository'),
      competitionRepository: c.resolve('competitionRepository'),
      teamRepository: c.resolve('teamRepository'),
      playerRepository: c.resolve('playerRepository'),
      scoreRepository: c.resolve('scoreRepository'),
      tokenService: c.resolve('tokenService'),
      socketManager: null,
      logger: c.resolve('logger'),
      cacheService: c.resolve('cacheService'),
    });
  }, 'singleton');
  container.register('competitionService', (c) => new CompetitionService(
    c.resolve('competitionRepository'),
    c.resolve('cacheService'),
    null,
    c.resolve('logger')
  ), 'singleton');
  container.register('registrationService', (c) => new RegistrationService(
    c.resolve('competitionRepository'),
    c.resolve('teamRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');
  container.register('teamService', (c) => new TeamService(
    c.resolve('teamRepository'),
    c.resolve('playerRepository'),
    c.resolve('competitionRepository'),
    c.resolve('cacheService'),
    null,
    c.resolve('logger')
  ), 'singleton');
  container.register('scoringService', (c) => new ScoringService(
    c.resolve('scoreRepository'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository'),
    c.resolve('judgeRepository'),
    null,
    c.resolve('logger')
  ), 'singleton');

  container.register('competitionController', (c) => createCompetitionController(c), 'singleton');
  container.register('teamController', (c) => createTeamController(c), 'singleton');
  container.register('healthController', (c) => new HealthController(c.resolve('healthMonitor'), c.resolve('metricsCollector'), c.resolve('logger')), 'singleton');
  container.register('coachController', (c) => createCoachController(c), 'singleton');
  container.register('adminController', (c) => createAdminController(c), 'singleton');
  container.register('authController', (c) => createAuthController(c), 'singleton');
  container.register('playerController', (c) => createPlayerController(c), 'singleton');
  container.register('judgeController', (c) => createJudgeController(c), 'singleton');
  container.register('superAdminController', (c) => createSuperAdminController(c), 'singleton');
  container.register('paymentController', (c) => createPaymentController(c), 'singleton');

  container.register('cacheWarmer', (c) => new CacheWarmer(
    c.resolve('competitionService'),
    null,
    c.resolve('teamService'),
    c.resolve('logger')
  ), 'singleton');

  return { container, config: container.resolve('config') };
}

/**
 * Initialize Socket.IO components
 * Must be called after HTTP server is created
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {SocketManager} Socket manager instance
 */
function initializeSocketIO(httpServer) {
  container.register('socketManager', (c) => {
    const manager = new SocketManager(
      httpServer,
      c.resolve('tokenService'),
      c.resolve('authorizationService'),
      c.resolve('config'),
      c.resolve('logger'),
      c.resolve('metricsCollector')
    );
    
    // Initialize the Socket.IO server
    manager.initialize();
    
    return manager;
  }, 'singleton');

  const socketManager = container.resolve('socketManager');

  container.resolve('scoringService').socketManager = socketManager;
  container.resolve('competitionService').socketManager = socketManager;
  container.resolve('teamService').socketManager = socketManager;
  container.resolve('judgeService').socketManager = socketManager;
  container.resolve('adminService').socketManager = socketManager;

  // Register event handlers
  container.register('scoringHandler', (c) => {
    const handler = new ScoringHandler(
      c.resolve('socketManager'),
      c.resolve('scoringService'),
      c.resolve('authorizationService'),
      c.resolve('logger'),
      c.resolve('judgeService')
    );
    
    // Register event handlers
    handler.register();
    
    return handler;
  }, 'singleton');

  container.register('notificationHandler', (c) => {
    const handler = new NotificationHandler(
      c.resolve('socketManager'),
      c.resolve('logger')
    );
    
    // Register event handlers
    handler.register();
    
    return handler;
  }, 'singleton');

  // Resolve handlers to initialize
  container.resolve('scoringHandler');
  container.resolve('notificationHandler');

  return socketManager;
}

/**
 * Warm cache with frequently accessed data
 * Should be called after application initialization
 * @returns {Promise<Object>} Warming statistics
 */
async function warmCache() {
  try {
    const cacheWarmer = container.resolve('cacheWarmer');
    const stats = await cacheWarmer.warmCache();
    return stats;
  } catch (error) {
    const logger = container.resolve('logger');
    logger.error('Cache warming failed during startup', { error: error.message });
    // Don't throw - cache warming failure shouldn't prevent app startup
    return { errors: [{ type: 'startup', error: error.message }] };
  }
}

module.exports = { bootstrap, initializeSocketIO, warmCache };
