const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * Logger class providing structured logging with Winston
 * Supports different formats for development and production
 * Includes sensitive data redaction and file rotation
 */
class Logger {
  constructor(config) {
    this.config = config;
    this.logger = this.createLogger();
  }

  /**
   * Read a dotted config path. Supports ConfigManager (.get) and plain objects (tests).
   * @param {string} path
   * @returns {*}
   */
  getConfig(path) {
    if (this.config && typeof this.config.get === 'function') {
      return this.config.get(path);
    }
    const keys = path.split('.');
    let value = this.config;
    for (const key of keys) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[key];
    }
    return value;
  }

  /**
   * Create Winston logger with appropriate configuration
   * @returns {winston.Logger}
   */
  createLogger() {
    const nodeEnv = this.getConfig('server.nodeEnv');
    const isDevelopment = nodeEnv === 'development';

    /*
     * Tests log to the console and nowhere else.
     *
     * `isDevelopment` is false under NODE_ENV=test, so every `npm test` run was
     * taking the production branch and writing fourteen days of
     * combined-YYYY-MM-DD.log into Server/logs/ — a test suite should not leave
     * artefacts on disk, and these were indistinguishable from real ones.
     */
    const isTest = nodeEnv === 'test';

    // Format for development (human-readable, colorized)
    const devFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta, null, 2)}`;
        }
        return msg;
      })
    );

    // Format for production (JSON structured)
    const prodFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Create transports array
    const transports = [
      // Console transport
      new winston.transports.Console({
        format: isDevelopment ? devFormat : prodFormat
      })
    ];

    /*
     * Log files belong to Server/, not to whoever's directory the process was
     * started from. `path.join('logs', ...)` is resolved against `process.cwd()`,
     * so `node Server/server.js` from the repo root quietly wrote its logs to
     * the repo root instead.
     *
     * LOG_DIR overrides it for a second instance of the same release, which
     * must not write into the real API's files (the nightly e2e copy,
     * deploy/oci/PLAN.md O14).
     */
    const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');

    // Add file transports with rotation
    if (isTest) {
      // Nothing. See the note above `isTest`.
    } else if (!isDevelopment) {
      // Error log with rotation
      transports.push(
        new DailyRotateFile({
          filename: path.join(LOG_DIR, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d',
          format: prodFormat
        })
      );

      // Combined log with rotation
      transports.push(
        new DailyRotateFile({
          filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: prodFormat
        })
      );
    } else {
      /*
       * Development: size-based rollover, and `tailable` is what BOUNDS it.
       *
       * Without it winston writes combined.log, then combined1.log, 2, 3 … and
       * prunes only the files IT created in the current process. Every restart
       * begins a fresh generation and abandons the previous one, so the cap of
       * five is a cap per process rather than on disk. Fifteen orphaned files
       * across three generations — combined3-7, 13-17, 20-24, 74 MB — is what
       * that looked like by 2026-09-22.
       *
       * `tailable: true` keeps the newest data in combined.log and shifts the
       * older content down a FIXED set of names, so the five files are the same
       * five files across restarts.
       */
      transports.push(
        new winston.transports.File({
          filename: path.join(LOG_DIR, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          tailable: true,
          format: prodFormat
        })
      );

      transports.push(
        new winston.transports.File({
          filename: path.join(LOG_DIR, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          tailable: true,
          format: prodFormat
        })
      );
    }

    return winston.createLogger({
      level: isDevelopment ? 'debug' : 'info',
      defaultMeta: {
        service: 'mallakhamb-api',
        environment: this.getConfig('server.nodeEnv')
      },
      transports
    });
  }

  /**
   * Redact sensitive information from logs
   * @param {Object} data - Data to redact
   * @returns {Object} Redacted data
   */
  redact(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'jwt',
      'accessToken',
      'refreshToken',
      'resetPasswordToken',
      'otp',
      'pin',
      'ssn',
      'creditCard',
      'cvv',
      'accountNumber'
    ];

    const redacted = Array.isArray(data) ? [...data] : { ...data };

    // Recursively redact nested objects
    for (const key in redacted) {
      if (redacted.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();
        
        // Check if key matches sensitive field
        const isSensitive = sensitiveFields.some(field => 
          lowerKey.includes(field.toLowerCase())
        );

        if (isSensitive) {
          redacted[key] = '[REDACTED]';
        } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
          // Recursively redact nested objects
          redacted[key] = this.redact(redacted[key]);
        }
      }
    }

    return redacted;
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    this.logger.error(message, this.redact(meta));
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, this.redact(meta));
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, this.redact(meta));
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, this.redact(meta));
  }

  /**
   * Log HTTP request message
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  http(message, meta = {}) {
    this.logger.http(message, this.redact(meta));
  }

  /**
   * Get the underlying Winston logger instance
   * @returns {winston.Logger}
   */
  getLogger() {
    return this.logger;
  }
}

module.exports = Logger;
