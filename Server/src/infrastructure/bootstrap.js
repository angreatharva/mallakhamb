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

  return {
    container,
    config
  };
}

module.exports = { bootstrap };
