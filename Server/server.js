const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Load environment variables FIRST
dotenv.config();

// Import new infrastructure components
const config = require('./src/config/config-manager');

// Load and validate configuration at startup
config.load();

// Import error middleware from new structure
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

// Import bootstrap for DI container and Socket.IO initialization
const { bootstrap, initializeSocketIO } = require('./src/infrastructure/bootstrap');

// Import metrics middleware
const { createMetricsMiddleware, createErrorMetricsMiddleware } = require('./src/middleware/metrics.middleware');

// Bootstrap application (initialize DI container and services)
const { container } = bootstrap();

// Connect to database using new DatabaseConnection
const databaseConnection = container.resolve('databaseConnection');
databaseConnection.connect().catch(error => {
  console.error('Failed to connect to database:', error);
  process.exit(1);
});

// Resolve metrics collector for middleware
const metricsCollector = container.resolve('metricsCollector');

const app = express();
const server = http.createServer(app);

// Trust proxy - Required for Render and other reverse proxies
app.set('trust proxy', 1);

// Initialize Socket.IO using the new SocketManager
const socketManager = initializeSocketIO(server);
const io = socketManager.getIO();

// Make io available to routes
app.set('io', io);

// Get allowed origins from config
const allowedOrigins = config.get('cors.allowedOrigins');

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin header required'));
      }
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-competition-id'],
  optionsSuccessStatus: 200
};

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// HTTPS enforcement in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

app.use(cors(corsOptions));

// Additional CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,ngrok-skip-browser-warning,x-competition-id');
  next();
});

// Request size limits
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// NoSQL injection protection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️ Sanitized potentially malicious input: ${key}`);
  }
}));

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

// Metrics collection middleware
app.use(createMetricsMiddleware(metricsCollector));

// Request coalescing middleware
const requestCoalescingMiddleware = container.resolve('requestCoalescingMiddleware');
app.use(requestCoalescingMiddleware.middleware());

const { loadRoutes } = require('./src/routes');
loadRoutes(app, container, { authLimiter });

// Debug endpoints (development only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/cors', (req, res) => {
    res.json({ 
      message: 'CORS test successful',
      origin: req.headers.origin,
      allowedOrigins: config.get('cors.allowedOrigins'),
      timestamp: new Date().toISOString() 
    });
  });

  app.get('/api/debug/env', (req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      CLIENT_URL: process.env.CLIENT_URL,
      allowedOrigins: config.get('cors.allowedOrigins'),
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/debug/test-email', async (req, res) => {
    const emailService = container.resolve('emailService');
    
    try {
      const testEmail = req.body.email || 'test@example.com';
      const isHealthy = await emailService.checkHealth();
      
      const result = await emailService.sendEmail({
        to: testEmail,
        subject: 'Test Email - Mallakhamb Competition',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Test Email</h1>
          <p>This is a test email from the Mallakhamb Competition system.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p>If you received this email, the email service is working correctly!</p>
        </div>
        `
      });
      
      res.json({
        message: 'Email test completed',
        connectivityTest: { healthy: isHealthy },
        emailSent: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        message: 'Email test failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// 404 handler
app.use(notFoundHandler);

// Error metrics middleware
app.use(createErrorMetricsMiddleware(metricsCollector));

// Error handling middleware
app.use(errorHandler);

const PORT = config.get('server.port');

// Start server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.IO server running`);
    console.log(`Environment: ${config.get('server.nodeEnv')}`);
    console.log('🔗 CORS allowed origins:', config.get('cors.allowedOrigins'));

    // Register graceful shutdown handler
    const gracefulShutdownHandler = container.resolve('gracefulShutdownHandler');
    
    gracefulShutdownHandler.register({
      server: server,
      socketManager: socketManager,
      dbConnection: databaseConnection,
      metricsCollector: metricsCollector
    });
    
    console.log('✅ Graceful shutdown handler registered');
  });
}

// Export app for testing
module.exports = app;
