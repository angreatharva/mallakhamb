const container = require('./di-container');
const configManager = require('../config/config-manager');
const Logger = require('./logger');

const PlayerRepository = require('../repositories/player.repository');
const CoachRepository = require('../repositories/coach.repository');
const AdminRepository = require('../repositories/admin.repository');
const JudgeRepository = require('../repositories/judge.repository');
const JudgeAccountRepository = require('../repositories/judge-account.repository');
const CompetitionRepository = require('../repositories/competition.repository');
const TeamRepository = require('../repositories/team.repository');
const ScoreRepository = require('../repositories/score.repository');
const TransactionRepository = require('../repositories/transaction.repository');
const AuditLogRepository = require('../repositories/audit-log.repository');
const PerformanceOrderRepository = require('../repositories/performance-order.repository');
const TieBreakDrawRepository = require('../repositories/tie-break-draw.repository');
const RefreshTokenRepository = require('../repositories/refresh-token.repository');

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
const PublicService = require('../services/public/public.service');
const SuperAdminService = require('../services/user/super-admin.service');
const JudgeAccountService = require('../services/user/judge-account.service');
const JudgePanelService = require('../services/user/judge-panel.service');
const CompetitionService = require('../services/competition/competition.service');
const CompetitionStatusService = require('../services/competition/competition-status.service');
const RegistrationService = require('../services/competition/registration.service');
const PerformanceOrderService = require('../services/competition/performance-order.service');
const TeamService = require('../services/team/team.service');
const ScoringService = require('../services/scoring/scoring.service');
const CalculationService = require('../services/scoring/calculation.service');
const TieBreakDrawService = require('../services/scoring/tie-break-draw.service');
const PaymentService = require('../services/payment/payment.service');

const createCompetitionController = require('../controllers/competition.controller');
const createTeamController = require('../controllers/team.controller');
const HealthController = require('../controllers/health.controller');
const createCoachController = require('../controllers/coach.controller');
const createAdminController = require('../controllers/admin.controller');
const createPublicController = require('../controllers/public.controller');
const createAuthController = require('../controllers/auth.controller');
const createPlayerController = require('../controllers/player.controller');
const createJudgeController = require('../controllers/judge.controller');
const createSuperAdminController = require('../controllers/super-admin.controller');
const createPaymentController = require('../controllers/payment.controller');
const createPerformanceOrderController = require('../controllers/performance-order.controller');
const createTieBreakDrawController = require('../controllers/tie-break-draw.controller');

const HealthMonitor = require('./health-monitor');
const { createMetrics } = require('./prometheus/registry');
const GracefulShutdownHandler = require('./graceful-shutdown');
const DatabaseConnection = require('./database/connection');

const SocketManager = require('../socket/socket.manager');
const ScoringHandler = require('../socket/handlers/scoring.handler');
const NotificationHandler = require('../socket/handlers/notification.handler');
const RequestCoalescingMiddleware = require('../middleware/request-coalescing.middleware');

// Phase 2A — Redis + token invalidation
const RedisClient = require('./redis-client');
const TokenInvalidationService = require('../services/auth/token-invalidation.service');
const { setTokenInvalidationService } = require('../utils/security/token-invalidation.util');

function bootstrap() {
  configManager.load();
  container.register('config', () => configManager, 'singleton');
  container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');
  // Prometheus registry for GET /metrics (deploy/monitoring/PLAN.md). Passed as
  // an optional LAST argument to each instrumented class, which defaults to a
  // no-op, so every harness that builds those classes without it still works.
  container.register('metrics', (c) => createMetrics({ logger: c.resolve('logger') }), 'singleton');
  container.register('databaseConnection', (c) => new DatabaseConnection(c.resolve('config'), c.resolve('logger'), c.resolve('metrics')), 'singleton');
  container.register('emailService', (c) => new EmailService(c.resolve('config'), c.resolve('logger'), c.resolve('metrics')), 'singleton');
  container.register('healthMonitor', (c) => new HealthMonitor(c.resolve('config'), c.resolve('logger'), c.resolve('emailService')), 'singleton');
  container.register('gracefulShutdownHandler', (c) => new GracefulShutdownHandler(c.resolve('logger'), c.resolve('config')), 'singleton');
  container.register('requestCoalescingMiddleware', (c) => new RequestCoalescingMiddleware(c.resolve('logger')), 'singleton');

  // --- Redis + Token Invalidation (Phase 2A, Item 2.4) ---
  container.register('redisClient', (c) => new RedisClient(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('tokenInvalidationService', (c) => {
    const svc = new TokenInvalidationService(c.resolve('redisClient'), c.resolve('logger'));
    // Wire the shim so existing sync callers get the service
    setTokenInvalidationService(svc);
    return svc;
  }, 'singleton');

  container.register('playerRepository', (c) => new PlayerRepository(c.resolve('logger')), 'singleton');
  container.register('coachRepository', (c) => new CoachRepository(c.resolve('logger')), 'singleton');
  container.register('adminRepository', (c) => new AdminRepository(c.resolve('logger')), 'singleton');
  container.register('judgeRepository', (c) => new JudgeRepository(c.resolve('logger')), 'singleton');
  // The judge as a PERSON. `judgeRepository` above serves panel assignments;
  // the two are different collections and must not be swapped by mistake.
  container.register('judgeAccountRepository', (c) => new JudgeAccountRepository(c.resolve('logger')), 'singleton');
  container.register('competitionRepository', (c) => new CompetitionRepository(c.resolve('logger')), 'singleton');
  container.register('teamRepository', (c) => new TeamRepository(c.resolve('logger')), 'singleton');
  container.register('scoreRepository', (c) => new ScoreRepository(c.resolve('logger')), 'singleton');
  container.register('transactionRepository', (c) => new TransactionRepository(c.resolve('logger')), 'singleton');
  container.register('auditLogRepository', (c) => new AuditLogRepository(c.resolve('logger')), 'singleton');
  container.register('performanceOrderRepository', (c) => new PerformanceOrderRepository(c.resolve('logger')), 'singleton');
  container.register('tieBreakDrawRepository', (c) => new TieBreakDrawRepository(c.resolve('logger')), 'singleton');
  container.register('refreshTokenRepository', (c) => new RefreshTokenRepository(c.resolve('logger')), 'singleton');

  container.register('cacheService', (c) => new CacheService(c.resolve('config'), c.resolve('logger')), 'singleton');
  container.register('tokenService', (c) => new TokenService(
    c.resolve('config'),
    c.resolve('logger'),
    c.resolve('refreshTokenRepository'),
  ), 'singleton');
  container.register('otpService', (c) => new OTPService(
    c.resolve('config'),
    c.resolve('logger'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('emailService'),
    c.resolve('judgeRepository'),
    c.resolve('judgeAccountRepository')
  ), 'singleton');
  container.register('authenticationService', (c) => new AuthenticationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('tokenService'),
    c.resolve('otpService'),
    c.resolve('logger'),
    c.resolve('judgeAccountRepository'),
    c.resolve('metrics')
  ), 'singleton');
  container.register('authorizationService', (c) => new AuthorizationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger'),
    c.resolve('judgeAccountRepository')
  ), 'singleton');
  container.register('paymentService', (c) => new PaymentService(c.resolve('config'), c.resolve('logger'), c.resolve('transactionRepository'), c.resolve('competitionRepository'), c.resolve('metrics')), 'singleton');

  container.register('playerService', (c) => new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService'),
    c.resolve('authenticationService'),
    c.resolve('competitionRepository')
  ), 'singleton');
  container.register('coachService', (c) => new CoachService(
    c.resolve('coachRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger'),
    c.resolve('cacheService'),
    c.resolve('authenticationService'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository'),
    c.resolve('config'),
    c.resolve('transactionRepository')
  ), 'singleton');
  container.register('calculationService', (c) => new CalculationService(c.resolve('logger')), 'singleton');
  // Seating judges on panels. Registered before adminService because that one
  // delegates to it; resolve this directly for anything new.
  container.register('judgePanelService', (c) => new JudgePanelService({
    judgeRepository: c.resolve('judgeRepository'),
    judgeAccountRepository: c.resolve('judgeAccountRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    logger: c.resolve('logger'),
  }), 'singleton');

  container.register('adminService', (c) => new AdminService({
    adminRepository: c.resolve('adminRepository'),
    playerRepository: c.resolve('playerRepository'),
    coachRepository: c.resolve('coachRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    teamRepository: c.resolve('teamRepository'),
    judgeRepository: c.resolve('judgeRepository'),
    judgeAccountRepository: c.resolve('judgeAccountRepository'),
    scoreRepository: c.resolve('scoreRepository'),
    transactionRepository: c.resolve('transactionRepository'),
    calculationService: c.resolve('calculationService'),
    // Task 3.1: scoring moved to ScoringService; adminService delegates so
    // every existing caller and route keeps working. Judge seating moved out
    // the same way on 2026-09-22.
    scoringService: c.resolve('scoringService'),
    judgePanelService: c.resolve('judgePanelService'),
    socketManager: null,
    logger: c.resolve('logger'),
    cacheService: c.resolve('cacheService'),
    authenticationService: c.resolve('authenticationService'),
    // Read only by getSystemHealth, which used to hardcode 'healthy'.
    emailService: c.resolve('emailService'),
  }), 'singleton');
  container.register('publicService', (c) => new PublicService({
    competitionRepository: c.resolve('competitionRepository'),
    scoreRepository: c.resolve('scoreRepository'),
    adminService: c.resolve('adminService'),
    tieBreakDrawRepository: c.resolve('tieBreakDrawRepository'),
    logger: c.resolve('logger'),
  }), 'singleton');
  container.register('competitionService', (c) => new CompetitionService(
    c.resolve('competitionRepository'),
    c.resolve('cacheService'),
    null,
    c.resolve('logger'),
    c.resolve('adminRepository')
  ), 'singleton');
  /*
   * Flips `status` to 'completed' at the instant a meet locks, so the stored
   * status and the read-only state are one fact. Started from server.js, not
   * here — resolving it must not arm a timer in the harnesses that build a
   * container without running a server.
   */
  container.register('competitionStatusService', (c) => new CompetitionStatusService(
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
  container.register('superAdminService', (c) => new SuperAdminService({
    authenticationService: c.resolve('authenticationService'),
    adminRepository: c.resolve('adminRepository'),
    coachRepository: c.resolve('coachRepository'),
    teamRepository: c.resolve('teamRepository'),
    judgeRepository: c.resolve('judgeRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    competitionService: c.resolve('competitionService'),
    transactionRepository: c.resolve('transactionRepository'),
    playerRepository: c.resolve('playerRepository'),
    logger: c.resolve('logger'),
    config: c.resolve('config'),
  }), 'singleton');
  container.register('judgeService', (c) => {
    const JudgeService = require('../services/user/judge.service');
    return new JudgeService({
      judgeRepository: c.resolve('judgeRepository'),
      judgeAccountRepository: c.resolve('judgeAccountRepository'),
      competitionRepository: c.resolve('competitionRepository'),
      teamRepository: c.resolve('teamRepository'),
      playerRepository: c.resolve('playerRepository'),
      scoreRepository: c.resolve('scoreRepository'),
      tokenService: c.resolve('tokenService'),
      socketManager: null,
      logger: c.resolve('logger'),
      cacheService: c.resolve('cacheService'),
      metrics: c.resolve('metrics'),
    });
  }, 'singleton');
  container.register('judgeAccountService', (c) => new JudgeAccountService({
    judgeAccountRepository: c.resolve('judgeAccountRepository'),
    judgeRepository: c.resolve('judgeRepository'),
    competitionRepository: c.resolve('competitionRepository'),
    tokenService: c.resolve('tokenService'),
    logger: c.resolve('logger'),
  }), 'singleton');
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
  // Depends on adminService for `getSubmittedTeams`, which is the single
  // definition of "which teams are in this category" — the same one the judge
  // dashboard renders. Registered after it, and the dependency is one-way
  // (adminService knows nothing about running order), so the container's
  // circular-dependency detector stays quiet.
  container.register('performanceOrderService', (c) => new PerformanceOrderService({
    performanceOrderRepository: c.resolve('performanceOrderRepository'),
    adminService: c.resolve('adminService'),
    judgeRepository: c.resolve('judgeRepository'),
    // Injected lazily after the HTTP server exists — see servicesNeedingSocket
    // in initializeSocketIO. A service missing from that list loses its
    // broadcasts silently, which here would mean the other judges' tablets
    // never re-sort.
    socketManager: null,
    logger: c.resolve('logger'),
  }), 'singleton');
  container.register('scoringService', (c) => new ScoringService(
    c.resolve('scoreRepository'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository'),
    c.resolve('judgeRepository'),
    null,
    c.resolve('logger'),
    // Task 3.1: the score-aggregation and ranking methods moved here from
    // admin.service need the calculation service.
    c.resolve('calculationService'),
    // `submitScore` validates the team a score is filed against.
    c.resolve('teamRepository'),
    c.resolve('metrics'),
    c.resolve('tieBreakDrawRepository')
  ), 'singleton');
  // Validates a draw against the standing scoringService ranks; one-way.
  container.register('tieBreakDrawService', (c) => new TieBreakDrawService({
    tieBreakDrawRepository: c.resolve('tieBreakDrawRepository'),
    scoringService: c.resolve('scoringService'),
    logger: c.resolve('logger'),
  }), 'singleton');

  container.register('competitionController', (c) => createCompetitionController(c), 'singleton');
  container.register('teamController', (c) => createTeamController(c), 'singleton');
  container.register('healthController', (c) => new HealthController(c.resolve('healthMonitor'), c.resolve('logger')), 'singleton');
  container.register('coachController', (c) => createCoachController(c), 'singleton');
  container.register('adminController', (c) => createAdminController(c), 'singleton');
  container.register('publicController', (c) => createPublicController(c), 'singleton');
  container.register('authController', (c) => createAuthController(c), 'singleton');
  container.register('playerController', (c) => createPlayerController(c), 'singleton');
  container.register('judgeController', (c) => createJudgeController(c), 'singleton');
  container.register('superAdminController', (c) => createSuperAdminController(c), 'singleton');
  container.register('paymentController', (c) => createPaymentController(c), 'singleton');
  container.register('performanceOrderController', (c) => createPerformanceOrderController(c), 'singleton');
  container.register('tieBreakDrawController', (c) => createTieBreakDrawController(c), 'singleton');

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
      c.resolve('metrics')
    );
    
    // Initialize the Socket.IO server
    manager.initialize();
    
    return manager;
  }, 'singleton');

  const socketManager = container.resolve('socketManager');

  // Provide lazy socket manager access to services that need it (LOW-14)
  // Instead of mutating `.socketManager` after resolution, we set a lazy getter
  // that resolves from the DI container on first access.
  const servicesNeedingSocket = [
    'scoringService',
    'competitionService',
    'teamService',
    'judgeService',
    'adminService',
    // Broadcasts `performance_order_updated` so a Senior Judge's drag lands on
    // every other tablet in the panel. Omitting it here does not fail loudly:
    // `broadcast()` no-ops on a null socketManager and the save still succeeds,
    // so the only symptom is judges quietly seeing a stale running order.
    'performanceOrderService',
  ];

  for (const serviceName of servicesNeedingSocket) {
    const service = container.resolve(serviceName);
    Object.defineProperty(service, 'socketManager', {
      get() {
        // Replace the getter with the resolved value after first access
        const sm = container.resolve('socketManager');
        Object.defineProperty(this, 'socketManager', { value: sm, writable: true, configurable: true });
        return sm;
      },
      configurable: true,
    });
  }

  // Register event handlers
  container.register('scoringHandler', (c) => {
    const handler = new ScoringHandler(
      c.resolve('socketManager'),
      c.resolve('scoringService'),
      c.resolve('authorizationService'),
      c.resolve('logger'),
      c.resolve('judgeService'),
      // The competition lock needs the meet's endDate; the socket path is the
      // one live-scoring surface that does not pass through Express, so it
      // cannot borrow `competition-lock.middleware` and reads the record itself.
      c.resolve('competitionRepository')
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
