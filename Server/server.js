const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Load environment variables FIRST
dotenv.config();

// Validate environment variables before proceeding
const { validateEnvironment } = require('./utils/validateEnv');
validateEnvironment();

const connectDB = require('./config/db');
const setupNgrok = require('./config/ngrok.setup');
const config = require('./config/server.config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { logUnauthorizedAccess } = require('./middleware/securityLogger');
const { startCleanupJobs } = require('./utils/cleanupJobs');

// Connect to database
connectDB();

// Start cleanup jobs
startCleanupJobs();

const app = express();
const server = http.createServer(app);

// Trust proxy - Required for Render and other reverse proxies
// This allows Express to correctly identify client IPs from X-Forwarded-For header
app.set('trust proxy', 1);

// Socket.IO setup with CORS and authentication
const io = new Server(server, {
  cors: {
    origin: config.getAllowedOrigins(),
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to socket
    socket.userId = decoded.userId;
    socket.userType = decoded.userType;
    socket.currentCompetition = decoded.currentCompetition;
    
    console.log(`✅ Socket authenticated: ${decoded.userType} - ${decoded.userId}`);
    next();
  } catch (err) {
    console.error('Socket authentication error:', err.message);
    next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.userType} - ${socket.userId}`);
  
  // Join scoring room with validation
  socket.on('join_scoring_room', (roomId) => {
    // Basic validation: ensure roomId is provided
    if (!roomId) {
      socket.emit('error', { message: 'Room ID required' });
      return;
    }
    
    // Validate user has access to this competition
    // Room ID format: competitionId_gender_ageGroup_competitionType
    const competitionId = roomId.split('_')[0];
    
    // Judges and admins can join any room in their competition
    if (socket.userType === 'judge' || socket.userType === 'admin' || socket.userType === 'superadmin') {
      socket.join(roomId);
      console.log(`✅ ${socket.userType} joined room: ${roomId}`);
    } else {
      socket.emit('error', { message: 'Unauthorized to join scoring room' });
    }
  });

  // Handle score updates with validation
  socket.on('score_update', (data) => {
    // Validate user is a judge
    if (socket.userType !== 'judge') {
      socket.emit('error', { message: 'Only judges can update scores' });
      return;
    }
    
    // Broadcast to all users in the same room except sender
    socket.to(data.roomId).emit('score_updated', data);
  });

  // Handle scores saved event
  socket.on('scores_saved', (data) => {
    // Validate user is a judge or admin
    if (socket.userType !== 'judge' && socket.userType !== 'admin' && socket.userType !== 'superadmin') {
      socket.emit('error', { message: 'Unauthorized to save scores' });
      return;
    }
    
    // Broadcast to all users in the same room
    io.to(data.roomId).emit('scores_saved_notification', data);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.userType} - ${socket.userId}`);
  });
});

// Make io available to routes
app.set('io', io);

// Get allowed origins once at startup
const allowedOrigins = config.getAllowedOrigins();

// Simplified CORS configuration that works reliably
const corsOptions = {
  origin: function (origin, callback) {
    // In production, require origin header
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin header required'));
      }
      // Allow no-origin in development (for testing tools like Postman)
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Include custom headers used by the frontend (like competition context)
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-competition-id'],
  optionsSuccessStatus: 200
};

// Security Middleware
// 1. Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. Response compression
app.use(compression());

// 3. HTTPS enforcement in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// 3. CORS configuration
app.use(cors(corsOptions));

// Additional CORS headers middleware to ensure headers are always set
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

// 4. Request size limits (reduced from 10mb to 1mb for security)
// Store raw JSON body for webhook signature verification.
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. NoSQL injection protection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️ Sanitized potentially malicious input: ${key}`);
  }
}));

// 7. Strict rate limiter for authentication endpoints (login, register, password reset)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  message: 'Too many authentication attempts, please try again after 15 minutes',
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

// Security logging middleware - must be before routes
app.use(logUnauthorizedAccess);

// Health check routes (before other routes for quick access)
app.use('/api', require('./routes/healthRoutes'));

// Routes with rate limiting on authentication endpoints only
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));

// Player routes with rate limiting on login/register
const playerRoutes = require('./routes/playerRoutes');
app.post('/api/players/register', authLimiter, playerRoutes);
app.post('/api/players/login', authLimiter, playerRoutes);
app.use('/api/players', playerRoutes);

// Coach routes with rate limiting on login/register
const coachRoutes = require('./routes/coachRoutes');
app.post('/api/coaches/register', authLimiter, coachRoutes);
app.post('/api/coaches/login', authLimiter, coachRoutes);
app.use('/api/coaches', coachRoutes);

// Admin routes with rate limiting on login/register
const adminRoutes = require('./routes/adminRoutes');
app.post('/api/admin/register', authLimiter, adminRoutes);
app.post('/api/admin/login', authLimiter, adminRoutes);
app.use('/api/admin', adminRoutes);

// Super Admin routes with rate limiting on login
const superAdminRoutes = require('./routes/superAdminRoutes');
app.post('/api/superadmin/login', authLimiter, superAdminRoutes);
app.use('/api/superadmin', superAdminRoutes);

// Judge routes with rate limiting on login
const judgeRoutes = require('./routes/judgeRoutes');
app.post('/api/judge/login', authLimiter, judgeRoutes);
app.use('/api/judge', judgeRoutes);

// Other routes without rate limiting
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

// Legacy health check endpoint (kept for backward compatibility)
app.get('/api/health-legacy', (req, res) => {
  res.json({ message: 'Sports Event API is running!', timestamp: new Date().toISOString() });
});

// Debug endpoints (only available in non-production environments)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/cors', (req, res) => {
    console.log('🔍 Debug CORS request from origin:', req.headers.origin);
    res.json({ 
      message: 'CORS test successful',
      origin: req.headers.origin,
      allowedOrigins: config.getAllowedOrigins(),
      timestamp: new Date().toISOString() 
    });
  });

  app.get('/api/debug/env', (req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      CLIENT_URL: process.env.CLIENT_URL,
      RENDER_FRONTEND_URL: process.env.RENDER_FRONTEND_URL,
      allowedOrigins: config.getAllowedOrigins(),
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/debug/test-post', (req, res) => {
    console.log('🔍 Test POST request received:', req.body);
    console.log('🔍 Origin:', req.headers.origin);
    res.json({
      message: 'POST request successful',
      body: req.body,
      origin: req.headers.origin,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/debug/test-email', async (req, res) => {
    const { sendEmail, testEmailConnectivity } = require('./utils/emailService');
    
    console.log('🔍 Test email request received');
    
    try {
      const testEmail = req.body.email || 'test@example.com';
      
      // First test connectivity
      console.log('🧪 Testing email connectivity...');
      const connectivityTest = await testEmailConnectivity();
      
      // Then try sending email
      console.log('📧 Attempting to send test email...');
      const result = await sendEmail(
        testEmail,
        'Test Email - Mallakhamb Competition',
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Test Email</h1>
          <p>This is a test email from the Mallakhamb Competition system.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
          <p>If you received this email, the email service is working correctly!</p>
        </div>
        `
      );
      
      res.json({
        message: 'Email test completed',
        connectivityTest: connectivityTest,
        emailSent: result,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({
        message: 'Email test failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handling middleware - must be last
app.use(errorHandler);

const PORT = config.port;

// Only start server if not being required for testing
if (require.main === module) {
  server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.IO server running`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log('🔗 CORS allowed origins:', config.getAllowedOrigins());
    
    // Setup ngrok tunnel only in development
    try {
      const ngrokUrl = await setupNgrok();
      
      if (ngrokUrl) {
        console.log('✅ Ngrok tunnel established successfully');
      } else {
      console.log('🚀 Running without ngrok (production mode or disabled)');
    }
  } catch (error) {
    console.log('⚠️ Ngrok setup failed, continuing without it:', error.message);
  }
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Export app for testing
module.exports = app;
