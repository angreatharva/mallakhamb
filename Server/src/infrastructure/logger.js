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
   * Create Winston logger with appropriate configuration
   * @returns {winston.Logger}
   */
  createLogger() {
    const isDevelopment = this.config.server.nodeEnv === 'development';

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

    // Add file transports with rotation
    if (!isDevelopment) {
      // Error log with rotation
      transports.push(
        new DailyRotateFile({
          filename: path.join('logs', 'error-%DATE%.log'),
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
          filename: path.join('logs', 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: prodFormat
        })
      );
    } else {
      // Simple file transports for development
      transports.push(
        new winston.transports.File({
          filename: path.join('logs', 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: prodFormat
        })
      );

      transports.push(
        new winston.transports.File({
          filename: path.join('logs', 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: prodFormat
        })
      );
    }

    return winston.createLogger({
      level: isDevelopment ? 'debug' : 'info',
      defaultMeta: {
        service: 'mallakhamb-api',
        environment: this.config.server.nodeEnv
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
