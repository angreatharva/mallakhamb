/**
 * Application Bootstrap
 * 
 * Initializes and registers all services with the DI container
 * This file should be imported at application startup
 */

const container = require('./di-container');
const configManager = require('../config/config-manager');
const Logger = require('./logger');

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

  // TODO: Register other services as they are implemented
  // Example:
  // container.register('database', (c) => new Database(c.resolve('config')), 'singleton');
  // container.register('playerRepository', (c) => new PlayerRepository(c.resolve('logger')), 'singleton');

  return {
    container,
    config
  };
}

module.exports = { bootstrap };
