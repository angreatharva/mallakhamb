/**
 * Security Middleware
 * 
 * Configures security headers, CORS, and rate limiting.
 * Applies environment-specific settings (Requirement 23.1, 23.4, 23.6).
 * 
 * Requirements: 13.7, 17.1, 17.2, 17.4, 23.4, 23.6
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ---------------------------------------------------------------------------
// Environment-specific rate limit configuration (Requirement 23.6)
// ---------------------------------------------------------------------------
const RATE_LIMIT_CONFIG = {
  production: {
    general: { windowMs: 15 * 60 * 1000, max: 100 },   // 100 req / 15 min
    auth:    { windowMs: 15 * 60 * 1000, max: 10  },   // 10  req / 15 min
    user:    { windowMs: 15 * 60 * 1000, max: 200 }    // 200 req / 15 min (per user)
  },
  staging: {
    general: { windowMs: 15 * 60 * 1000, max: 300 },
    auth:    { windowMs: 15 * 60 * 1000, max: 30  },
    user:    { windowMs: 15 * 60 * 1000, max: 500 }
  },
  development: {
    general: { windowMs: 60 * 1000, max: 1000 },        // 1000 req / 1 min
    auth:    { windowMs: 60 * 1000, max: 200  },
    user:    { windowMs: 60 * 1000, max: 2000 }
  },
  test: {
    general: { windowMs: 60 * 1000, max: 10000 },
    auth:    { windowMs: 60 * 1000, max: 10000 },
    user:    { windowMs: 60 * 1000, max: 10000 }
  }
};

/**
 * Get rate limit config for the current environment.
 * @param {string} nodeEnv - NODE_ENV value
 * @param {'general'|'auth'|'user'} type - Limit type
 * @returns {{ windowMs: number, max: number }}
 */
function getRateLimitConfig(nodeEnv, type) {
  const envConfig = RATE_LIMIT_CONFIG[nodeEnv] || RATE_LIMIT_CONFIG.development;
  return envConfig[type] || envConfig.general;
}

/**
 * Create helmet security headers middleware
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createHelmetMiddleware(container) {
  const config = container.resolve('config');
  const isDevelopment = config.get('server.nodeEnv') === 'development';

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: [
          "'self'", 
          "'unsafe-inline'", 
          "'unsafe-eval'",
          'https://checkout.razorpay.com',
          'https://cdn.razorpay.com'
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          'https://lumberjack.razorpay.com'
        ],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com'
        ]
      }
    },
    // Strict Transport Security (HTTPS only)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    // Prevent clickjacking
    frameguard: {
      action: 'deny'
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // XSS Protection
    xssFilter: true,
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    }
  });
}

/**
 * Create CORS middleware with environment-specific settings (Requirement 23.4)
 * - Production: only origins listed in CORS_ORIGINS env var are allowed
 * - Development/test: all origins are allowed
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createCorsMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  
  const corsOrigins = config.get('server.corsOrigins');
  const nodeEnv = config.get('server.nodeEnv');
  const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // In production/staging, enforce strict origin whitelist
      if (isProduction) {
        if (corsOrigins && corsOrigins.length > 0 && corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked request', { origin, nodeEnv });
          callback(new Error('Not allowed by CORS'));
        }
        return;
      }

      // In development/test, allow all origins
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-Request-ID',
      'X-Competition-ID',
      'X-CSRF-Token'
    ],
    exposedHeaders: [
      'X-Correlation-ID',
      'X-Response-Time',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-New-Token'
    ],
    maxAge: 86400 // 24 hours
  };

  return cors(corsOptions);
}

/**
 * Create rate limiting middleware per IP (Requirement 23.6)
 * Uses environment-specific limits.
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createIpRateLimitMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const nodeEnv = config.get('server.nodeEnv');

  const { windowMs, max } = getRateLimitConfig(nodeEnv, 'general');

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        message: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('IP rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        nodeEnv
      });
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests from this IP, please try again later',
          code: 'RATE_LIMIT_EXCEEDED'
        }
      });
    }
  });
}

/**
 * Create rate limiting middleware per user (Requirement 23.6)
 * Uses environment-specific limits.
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createUserRateLimitMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const nodeEnv = config.get('server.nodeEnv');

  const { windowMs, max } = getRateLimitConfig(nodeEnv, 'user');

  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return req.user?._id?.toString() || req.ip;
    },
    message: {
      success: false,
      error: {
        message: 'Too many requests from this account, please try again later',
        code: 'USER_RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for unauthenticated requests (handled by IP rate limit)
      return !req.user;
    },
    handler: (req, res) => {
      logger.warn('User rate limit exceeded', {
        userId: req.user?._id,
        userType: req.userType,
        ip: req.ip,
        path: req.path,
        method: req.method,
        nodeEnv
      });
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests from this account, please try again later',
          code: 'USER_RATE_LIMIT_EXCEEDED'
        }
      });
    }
  });
}

/**
 * Create strict rate limiting for sensitive endpoints
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @returns {Function} Express middleware
 */
function createStrictRateLimit(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
  const max = options.max || 5; // 5 requests per window

  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?._id?.toString() || req.ip;
    },
    message: {
      success: false,
      error: {
        message: 'Too many attempts, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

/**
 * Create environment-aware rate limiter for authentication endpoints (Requirement 23.6)
 * Stricter limits than general endpoints.
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createAuthRateLimitMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const nodeEnv = config.get('server.nodeEnv');

  const { windowMs, max } = getRateLimitConfig(nodeEnv, 'auth');

  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => req.ip,
    message: {
      success: false,
      error: {
        message: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        nodeEnv
      });
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many authentication attempts, please try again later',
          code: 'AUTH_RATE_LIMIT_EXCEEDED'
        }
      });
    }
  });
}

/**
 * Request size limit middleware
 * @param {string} limit - Size limit (e.g., '10mb', '1kb')
 * @returns {Object} Middleware configuration for express.json and express.urlencoded
 */
function createRequestSizeLimits(limit = '10mb') {
  return {
    json: { limit },
    urlencoded: { limit, extended: true }
  };
}

module.exports = {
  createHelmetMiddleware,
  createCorsMiddleware,
  createIpRateLimitMiddleware,
  createUserRateLimitMiddleware,
  createAuthRateLimitMiddleware,
  createStrictRateLimit,
  createRequestSizeLimits,
  getRateLimitConfig,
  RATE_LIMIT_CONFIG
};
