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

/**
 * Initialize application infrastructure
 * Loads configuration and registers core services
 */
function bootstrap() {
  // Load and validate configuration first
  const config = configManager.load();

  // Register configuration object as singleton
  container.register('config', () => config, 'singleton');

  // Register logger as singleton
  container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');

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
    c.resolve('logger')
  ), 'singleton');
  
  container.register('coachService', (c) => new CoachService(
    c.resolve('coachRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger')
  ), 'singleton');
  
  container.register('adminService', (c) => new AdminService(
    c.resolve('adminRepository'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
  
  // Competition services
  container.register('competitionService', (c) => new CompetitionService(
    c.resolve('competitionRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');
  
  container.register('registrationService', (c) => new RegistrationService(
    c.resolve('competitionRepository'),
    c.resolve('teamRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');
  
  // Team service
  container.register('teamService', (c) => new TeamService(
    c.resolve('teamRepository'),
    c.resolve('playerRepository'),
    c.resolve('competitionRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');
  
  // Scoring services
  container.register('calculationService', (c) => new CalculationService(
    c.resolve('logger')
  ), 'singleton');
  
  container.register('scoringService', (c) => new ScoringService(
    c.resolve('scoreRepository'),
    c.resolve('competitionRepository'),
    c.resolve('playerRepository'),
    c.resolve('judgeRepository'),
    c.resolve('logger')
  ), 'singleton');

  return {
    container,
    config
  };
}

module.exports = { bootstrap };
