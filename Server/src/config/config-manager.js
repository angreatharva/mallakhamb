/**
 * Configuration Manager
 * 
 * Centralized configuration management with:
 * - Environment variable loading and validation
 * - Typed getters for configuration values
 * - Environment-specific overrides
 * - Startup validation
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 23.1
 */

class ConfigManager {
  constructor() {
    this.config = null;
    this.env = process.env.NODE_ENV || 'development';
  }

  /**
   * Load and validate configuration
   * Must be called before accessing configuration
   */
  load() {
    if (this.config) {
      return this.config;
    }

    this.config = {
      server: {
        port: this.getNumber('PORT', 5000),
        nodeEnv: this.getString('NODE_ENV', 'development'),
        corsOrigins: this.getArray('CORS_ORIGINS', this.getDefaultCorsOrigins()),
        clientUrl: this.getString('CLIENT_URL', 'http://localhost:5173'),
        frontendUrl: this.getString('FRONTEND_URL', 'http://localhost:5173'),
        productionUrl: this.getString('PRODUCTION_URL', 'http://localhost:5173')
      },
      database: {
        uri: this.getRequired('MONGODB_URI'),
        poolSize: {
          min: this.getNumber('DB_POOL_MIN', 10),
          max: this.getNumber('DB_POOL_MAX', 100)
        },
        timeouts: {
          connection: this.getNumber('DB_CONNECT_TIMEOUT', 10000),
          socket: this.getNumber('DB_SOCKET_TIMEOUT', 45000)
        }
      },
      jwt: {
        secret: this.getRequired('JWT_SECRET'),
        expiresIn: this.getString('JWT_EXPIRES_IN', '24h')
      },
      email: {
        provider: this.getString('EMAIL_PROVIDER', 'nodemailer'),
        from: this.getString('EMAIL_USER', ''),
        nodemailer: {
          host: this.getString('EMAIL_HOST', 'smtp.gmail.com'),
          port: this.getNumber('EMAIL_PORT', 587),
          secure: this.getBoolean('EMAIL_SECURE', false),
          user: this.getString('EMAIL_USER', ''),
          password: this.getString('EMAIL_PASS', '')
        },
        resend: {
          apiKey: this.getString('RESEND_API_KEY', ''),
          fromEmail: this.getString('RESEND_FROM_EMAIL', '')
        }
      },
      security: {
        bcryptRounds: this.getNumber('BCRYPT_ROUNDS', 12),
        otpLength: this.getNumber('OTP_LENGTH', 6),
        otpExpiry: this.getNumber('OTP_EXPIRY_MINUTES', 10),
        maxLoginAttempts: this.getNumber('MAX_LOGIN_ATTEMPTS', 5),
        lockoutDuration: this.getNumber('LOCKOUT_DURATION_MINUTES', 15)
      },
      razorpay: {
        keyId: this.getString('RAZORPAY_KEY_ID', ''),
        keySecret: this.getString('RAZORPAY_KEY_SECRET', '')
      },
      cache: {
        ttl: this.getNumber('CACHE_TTL_SECONDS', 300),
        maxSize: this.getNumber('CACHE_MAX_SIZE', 1000)
      },
      features: {
        enableCaching: this.getBoolean('ENABLE_CACHING', true),
        enableMetrics: this.getBoolean('ENABLE_METRICS', true),
        enableNgrok: this.getBoolean('NGROK_ENABLED', false)
      },
      ngrok: {
        enabled: this.getBoolean('NGROK_ENABLED', false),
        authToken: this.getString('NGROK_AUTH_TOKEN', '')
      }
    };

    // Validate configuration
    this.validate();

    return this.config;
  }

  /**
   * Validate configuration at startup
   * @throws {Error} If configuration is invalid
   */
  validate() {
    const errors = [];

    // Validate required fields
    if (!this.config.database.uri) {
      errors.push('MONGODB_URI is required');
    }

    if (!this.config.jwt.secret) {
      errors.push('JWT_SECRET is required');
    }

    // Validate JWT secret length (minimum 32 characters for security)
    if (this.config.jwt.secret && this.config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    // Validate port range
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('PORT must be between 1 and 65535');
    }

    // Validate database pool sizes
    if (this.config.database.poolSize.min < 0) {
      errors.push('DB_POOL_MIN must be non-negative');
    }

    if (this.config.database.poolSize.max < this.config.database.poolSize.min) {
      errors.push('DB_POOL_MAX must be greater than or equal to DB_POOL_MIN');
    }

    // Validate timeouts
    if (this.config.database.timeouts.connection < 1000) {
      errors.push('DB_CONNECT_TIMEOUT must be at least 1000ms');
    }

    if (this.config.database.timeouts.socket < 1000) {
      errors.push('DB_SOCKET_TIMEOUT must be at least 1000ms');
    }

    // Validate bcrypt rounds (recommended: 10-12)
    if (this.config.security.bcryptRounds < 10 || this.config.security.bcryptRounds > 15) {
      errors.push('BCRYPT_ROUNDS should be between 10 and 15 for security and performance');
    }

    // Validate OTP settings
    if (this.config.security.otpLength < 4 || this.config.security.otpLength > 8) {
      errors.push('OTP_LENGTH should be between 4 and 8');
    }

    if (this.config.security.otpExpiry < 1) {
      errors.push('OTP_EXPIRY_MINUTES must be at least 1');
    }

    // Validate email configuration based on provider
    if (this.config.email.provider === 'nodemailer') {
      if (!this.config.email.nodemailer.user || !this.config.email.nodemailer.password) {
        // Only warn in development, error in production
        if (this.config.server.nodeEnv === 'production') {
          errors.push('EMAIL_USER and EMAIL_PASS are required when using nodemailer provider');
        }
      }
    } else if (this.config.email.provider === 'resend') {
      if (!this.config.email.resend.apiKey) {
        if (this.config.server.nodeEnv === 'production') {
          errors.push('RESEND_API_KEY is required when using resend provider');
        }
      }
    }

    // Validate production-specific requirements
    if (this.config.server.nodeEnv === 'production') {
      if (!this.config.server.corsOrigins || this.config.server.corsOrigins.length === 0) {
        errors.push('CORS_ORIGINS must be configured in production');
      }
    }

    // Validate ngrok configuration
    if (this.config.features.enableNgrok && !this.config.ngrok.authToken) {
      errors.push('NGROK_AUTH_TOKEN is required when NGROK_ENABLED is true');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
  }

  /**
   * Get configuration value by path
   * @param {string} path - Dot-separated path (e.g., 'database.poolSize.min')
   * @returns {*} Configuration value
   */
  get(path) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
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
   * Get string value from environment
   * @param {string} key - Environment variable key
   * @param {string} defaultValue - Default value if not set
   * @returns {string}
   */
  getString(key, defaultValue = '') {
    const value = process.env[key];
    return value !== undefined && value !== '' ? value : defaultValue;
  }

  /**
   * Get number value from environment
   * @param {string} key - Environment variable key
   * @param {number} defaultValue - Default value if not set
   * @returns {number}
   */
  getNumber(key, defaultValue = 0) {
    const value = process.env[key];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get boolean value from environment
   * @param {string} key - Environment variable key
   * @param {boolean} defaultValue - Default value if not set
   * @returns {boolean}
   */
  getBoolean(key, defaultValue = false) {
    const value = process.env[key];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get array value from environment (comma-separated)
   * @param {string} key - Environment variable key
   * @param {Array} defaultValue - Default value if not set
   * @returns {Array}
   */
  getArray(key, defaultValue = []) {
    const value = process.env[key];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    return value.split(',').map(item => item.trim()).filter(item => item !== '');
  }

  /**
   * Get required value from environment
   * @param {string} key - Environment variable key
   * @returns {string}
   * @throws {Error} If value is not set
   */
  getRequired(key) {
    const value = process.env[key];
    if (value === undefined || value === '') {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Get default CORS origins based on environment
   * @returns {Array<string>}
   */
  getDefaultCorsOrigins() {
    if (this.env === 'production') {
      return [];
    }
    return ['http://localhost:5173', 'http://localhost:3000'];
  }

  /**
   * Check if running in development mode
   * @returns {boolean}
   */
  isDevelopment() {
    return this.env === 'development';
  }

  /**
   * Check if running in production mode
   * @returns {boolean}
   */
  isProduction() {
    return this.env === 'production';
  }

  /**
   * Check if running in test mode
   * @returns {boolean}
   */
  isTest() {
    return this.env === 'test';
  }

  /**
   * Get all configuration (read-only)
   * @returns {Object}
   */
  getAll() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    // Return a deep copy to prevent modification
    return JSON.parse(JSON.stringify(this.config));
  }
}

// Export singleton instance
module.exports = new ConfigManager();
