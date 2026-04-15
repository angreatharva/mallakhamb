/**
 * Application Bootstrap
 * 
 * Initializes and registers all services with the DI container
 * This file should be imported at application startup
 */

const container = require('./di-container');
const configManager = require('../config/config-manager');
const Logger = require('./logger');

// Import repositories
const PlayerRepository = require('../repositories/player.repository');
const CoachRepository = require('../repositories/coach.repository');
const AdminRepository = require('../repositories/admin.repository');
const JudgeRepository = require('../repositories/judge.repository');
const CompetitionRepository = require('../repositories/competition.repository');
const TeamRepository = require('../repositories/team.repository');
const ScoreRepository = require('../repositories/score.repository');
const TransactionRepository = require('../repositories/transaction.repository');

// Import services
const CacheService = require('../services/cache/cache.service');
const CacheWarmer = require('../services/cache/cache-warmer');
const EmailService = require('../services/email/email.service');
const TokenService = require('../services/auth/token.service');
const OTPService = require('../services/auth/otp.service');
const AuthenticationService = require('../services/auth/authentication.service');
const AuthorizationService = require('../services/auth/authorization.service');
const UserService = require('../services/user/user.service');
const PlayerService = require('../services/user/player.service');
const CoachService = require('../services/user/coach.service');
const AdminService = require('../services/user/admin.service');
const CompetitionService = require('../services/competition/competition.service');
const RegistrationService = require('../services/competition/registration.service');
const TeamService = require('../services/team/team.service');
const ScoringService = require('../services/scoring/scoring.service');
const CalculationService = require('../services/scoring/calculation.service');
const FeatureFlagService = require('../services/feature-flags/feature-flag.service');

// Import controllers
const CompetitionController = require('../controllers/competition.controller');
const TeamController = require('../controllers/team.controller');
const HealthController = require('../controllers/health.controller');
const coachController = require('../controllers/coach.controller');

// Import infrastructure components
const HealthMonitor = require('./health-monitor');
const MetricsCollector = require('./metrics-collector');
const GracefulShutdownHandler = require('./graceful-shutdown');
const DatabaseConnection = require('./database/connection');

// Import Socket.IO components
const SocketManager = require('../socket/socket.manager');
const ScoringHandler = require('../socket/handlers/scoring.handler');
const NotificationHandler = require('../socket/handlers/notification.handler');

// Import middleware
const RequestCoalescingMiddleware = require('../middleware/request-coalescing.middleware');

/**
 * Initialize application infrastructure
 * Loads configuration and registers core services
 */
function bootstrap() {
  // Load and validate configuration first
  configManager.load();

  // Register ConfigManager instance as singleton (not just the config object)
  container.register('config', () => configManager, 'singleton');

  // Register logger as singleton
  container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');

  // Register database connection
  container.register('databaseConnection', (c) => new DatabaseConnection(
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');

  // Register infrastructure components
  container.register('metricsCollector', (c) => new MetricsCollector(c.resolve('logger')), 'singleton');
  
  container.register('healthMonitor', (c) => new HealthMonitor(
    c.resolve('config'),
    c.resolve('logger'),
    c.resolve('emailService')
  ), 'singleton');

  container.register('gracefulShutdownHandler', (c) => new GracefulShutdownHandler(
    c.resolve('logger'),
    c.resolve('config')
  ), 'singleton');

  // Register middleware
  container.register('requestCoalescingMiddleware', (c) => new RequestCoalescingMiddleware(
    c.resolve('logger')
  ), 'singleton');

  // Register repositories as singletons with logger injection
  container.register('playerRepository', (c) => new PlayerRepository(c.resolve('logger')), 'singleton');
  container.register('coachRepository', (c) => new CoachRepository(c.resolve('logger')), 'singleton');
  container.register('adminRepository', (c) => new AdminRepository(c.resolve('logger')), 'singleton');
  container.register('judgeRepository', (c) => new JudgeRepository(c.resolve('logger')), 'singleton');
  container.register('competitionRepository', (c) => new CompetitionRepository(c.resolve('logger')), 'singleton');
  container.register('teamRepository', (c) => new TeamRepository(c.resolve('logger')), 'singleton');
  container.register('scoreRepository', (c) => new ScoreRepository(c.resolve('logger')), 'singleton');
  container.register('transactionRepository', (c) => new TransactionRepository(c.resolve('logger')), 'singleton');

  // Register services as singletons
  
  // Cache service
  container.register('cacheService', (c) => new CacheService(
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');
  
  // Feature flag service
  container.register('featureFlagService', (c) => new FeatureFlagService(
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');
  
  // Email service
  container.register('emailService', (c) => new EmailService(
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');
  
  // Token service
  container.register('tokenService', (c) => new TokenService(
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');
  
  // OTP service
  container.register('otpService', (c) => new OTPService(
    c.resolve('config'),
    c.resolve('logger'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('emailService')
  ), 'singleton');
  
  // Authentication service
  container.register('authenticationService', (c) => new AuthenticationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('tokenService'),
    c.resolve('otpService'),
    c.resolve('config'),
    c.resolve('logger')
  ), 'singleton');
  
  // Authorization service
  container.register('authorizationService', (c) => new AuthorizationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
  
  // User services
  container.register('playerService', (c) => new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService')
  ), 'singleton');
  
  container.register('coachService', (c) => new CoachService(
    c.resolve('coachRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService')
  ), 'singleton');
  
  container.register('adminService', (c) => new AdminService(
    c.resolve('adminRepository'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger'),
    c.resolve('cacheService')
  ), 'singleton');
  
  // Competition services
  // Note: CompetitionService will have socketManager injected after Socket.IO initialization
  container.register('competitionService', (c) => {
    // Try to resolve socketManager if available, otherwise pass null
    let socketManager = null;
    try {
      socketManager = c.resolve('socketManager');
    } catch (e) {
      // socketManager not yet registered, will be set later
    }
    
    return new CompetitionService(
      c.resolve('competitionRepository'),
      c.resolve('cacheService'),
      socketManager,
      c.resolve('logger')
    );
  }, 'singleton');
  
  container.register('registrationService', (c) => new RegistrationService(
    c.resolve('competitionRepository'),
    c.resolve('teamRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');
  
  // Team service
  // Note: TeamService will have socketManager injected after Socket.IO initialization
  container.register('teamService', (c) => {
    // Try to resolve socketManager if available, otherwise pass null
    let socketManager = null;
    try {
      socketManager = c.resolve('socketManager');
    } catch (e) {
      // socketManager not yet registered, will be set later
    }
    
    return new TeamService(
      c.resolve('teamRepository'),
      c.resolve('playerRepository'),
      c.resolve('competitionRepository'),
      c.resolve('cacheService'),
      socketManager,
      c.resolve('logger')
    );
  }, 'singleton');
  
  // Scoring services
  container.register('calculationService', (c) => new CalculationService(
    c.resolve('logger')
  ), 'singleton');
  
  // Note: ScoringService will have socketManager injected after Socket.IO initialization
  container.register('scoringService', (c) => {
    // Try to resolve socketManager if available, otherwise pass null
    let socketManager = null;
    try {
      socketManager = c.resolve('socketManager');
    } catch (e) {
      // socketManager not yet registered, will be set later
    }
    
    return new ScoringService(
      c.resolve('scoreRepository'),
      c.resolve('competitionRepository'),
      c.resolve('playerRepository'),
      c.resolve('judgeRepository'),
      socketManager,
      c.resolve('logger')
    );
  }, 'singleton');

  // Register controllers
  container.register('competitionController', (c) => new CompetitionController(
    c.resolve('competitionService'),
    c.resolve('registrationService'),
    c.resolve('logger')
  ), 'singleton');

  container.register('teamController', (c) => new TeamController(
    c.resolve('teamService'),
    c.resolve('logger')
  ), 'singleton');

  container.register('healthController', (c) => new HealthController(
    c.resolve('healthMonitor'),
    c.resolve('metricsCollector'),
    c.resolve('logger')
  ), 'singleton');

  // Register coach controller (functional module, not a class)
  container.register('coachController', () => coachController, 'singleton');

  // Register cache warmer
  container.register('cacheWarmer', (c) => new CacheWarmer(
    c.resolve('competitionService'),
    null, // userService - not needed for initial warming
    null, // teamService - not needed for initial warming
    c.resolve('logger')
  ), 'singleton');

  // Note: Socket.IO components are registered separately via initializeSocketIO()
  // because they require the HTTP server instance which is not available during bootstrap

  return {
    container,
    config: container.resolve('config')
  };
}

/**
 * Initialize Socket.IO components
 * Must be called after HTTP server is created
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {SocketManager} Socket manager instance
 */
function initializeSocketIO(httpServer) {
  // Register Socket.IO manager
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

  // Resolve socketManager to initialize it
  const socketManager = container.resolve('socketManager');

  // Inject socketManager into services that need it
  const scoringService = container.resolve('scoringService');
  scoringService.socketManager = socketManager;

  const competitionService = container.resolve('competitionService');
  competitionService.socketManager = socketManager;

  const teamService = container.resolve('teamService');
  teamService.socketManager = socketManager;

  // Register event handlers
  container.register('scoringHandler', (c) => {
    const handler = new ScoringHandler(
      c.resolve('socketManager'),
      c.resolve('scoringService'),
      c.resolve('authorizationService'),
      c.resolve('logger')
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
