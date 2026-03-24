/**
 * Structured Logging Utility
 * Provides safe logging with automatic PII redaction
 */

const fs = require('fs');
const path = require('path');

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  'password',
  'token',
  'secret',
  'authorization',
  'jwt',
  'apikey',
  'api_key'
];

/**
 * Check if a key contains sensitive information
 * @param {string} key - The key to check
 * @returns {boolean} - True if sensitive
 */
const isSensitiveKey = (key) => {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
};

/**
 * Sanitize an object for logging by redacting sensitive fields
 * @param {*} obj - The object to sanitize
 * @returns {*} - Sanitized object
 */
const sanitizeForLog = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLog(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Format log entry with timestamp and level
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 * @returns {string} - Formatted log entry
 */
const formatLogEntry = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const sanitizedData = sanitizeForLog(data);
  
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...sanitizedData
  });
};

/**
 * Write log entry to file
 * @param {string} logFile - Log file path
 * @param {string} entry - Log entry to write
 */
const writeToFile = (logFile, entry) => {
  try {
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, entry + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
};

/**
 * Logger class with different log levels
 */
class Logger {
  constructor(context = '') {
    this.context = context;
  }

  info(message, data = {}) {
    const logData = this.context ? { context: this.context, ...data } : data;
    const entry = formatLogEntry('INFO', message, logData);
    console.log(entry);
  }

  warn(message, data = {}) {
    const logData = this.context ? { context: this.context, ...data } : data;
    const entry = formatLogEntry('WARN', message, logData);
    console.warn(entry);
  }

  error(message, data = {}) {
    const logData = this.context ? { context: this.context, ...data } : data;
    const entry = formatLogEntry('ERROR', message, logData);
    console.error(entry);
    
    // Write errors to file
    const errorLogPath = path.join(__dirname, '../logs/error.log');
    writeToFile(errorLogPath, entry);
  }

  security(message, data = {}) {
    const logData = this.context ? { context: this.context, ...data } : data;
    const entry = formatLogEntry('SECURITY', message, logData);
    console.warn(entry);
    
    // Write security events to file
    const securityLogPath = path.join(__dirname, '../logs/security.log');
    writeToFile(securityLogPath, entry);
  }
}

/**
 * Create a logger instance with optional context
 * @param {string} context - Context identifier (e.g., 'AuthController')
 * @returns {Logger} - Logger instance
 */
const createLogger = (context = '') => {
  return new Logger(context);
};

// Default logger instance
const logger = new Logger();

module.exports = {
  logger,
  createLogger,
  sanitizeForLog
};
