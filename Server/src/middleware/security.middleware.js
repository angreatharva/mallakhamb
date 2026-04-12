/**
 * Security Middleware
 * 
 * Configures security headers, CORS, and rate limiting
 * Protects against common web vulnerabilities
 * 
 * Requirements: 13.7, 17.1, 17.2, 17.4, 23.4
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

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
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
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
 * Create CORS middleware with environment-specific settings
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createCorsMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  
  const corsOrigins = config.get('server.corsOrigins');
  const isDevelopment = config.get('server.nodeEnv') === 'development';

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // In development, allow all origins
      if (isDevelopment) {
        return callback(null, true);
      }

      // In production, check against whitelist
      if (corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-ID',
      'X-Request-ID',
      'X-Competition-ID'
    ],
    exposedHeaders: [
      'X-Correlation-ID',
      'X-Response-Time',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    maxAge: 86400 // 24 hours
  };

  return cors(corsOptions);
}

/**
 * Create rate limiting middleware per IP
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createIpRateLimitMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const isDevelopment = config.get('server.nodeEnv') === 'development';

  // More lenient in development
  const windowMs = isDevelopment ? 60 * 1000 : 15 * 60 * 1000; // 1 min dev, 15 min prod
  const max = isDevelopment ? 1000 : 100; // 1000 req/min dev, 100 req/15min prod

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
        method: req.method
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
 * Create rate limiting middleware per user
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createUserRateLimitMiddleware(container) {
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const isDevelopment = config.get('server.nodeEnv') === 'development';

  // More lenient in development
  const windowMs = isDevelopment ? 60 * 1000 : 15 * 60 * 1000; // 1 min dev, 15 min prod
  const max = isDevelopment ? 2000 : 200; // 2000 req/min dev, 200 req/15min prod

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
        method: req.method
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
  createStrictRateLimit,
  createRequestSizeLimits
};
