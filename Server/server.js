const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables FIRST
dotenv.config();

const connectDB = require('./config/db');
const setupNgrok = require('./config/ngrok.setup');
const config = require('./config/server.config');

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const getCorsOrigins = () => {
  return config.getAllowedOrigins();
};

const io = new Server(server, {
  cors: {
    origin: getCorsOrigins(),
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Join scoring room
  socket.on('join_scoring_room', (roomId) => {
    socket.join(roomId);
  });

  // Handle score updates
  socket.on('score_update', (data) => {
    // Broadcast to all users in the same room except sender
    socket.to(data.roomId).emit('score_updated', data);
  });

  // Handle scores saved event
  socket.on('scores_saved', (data) => {
    // Broadcast to all users in the same room
    io.to(data.roomId).emit('scores_saved_notification', data);
  });

  socket.on('disconnect', () => {
    // User disconnected - no action needed
  });
});

// Make io available to routes
app.set('io', io);

// Simplified CORS configuration that works reliably
const allowedOrigins = config.getAllowedOrigins();
console.log('🔗 Server starting with allowed origins:', allowedOrigins);

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/players', require('./routes/playerRoutes'));
app.use('/api/coaches', require('./routes/coachRoutes'));
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Sports Event API is running!', timestamp: new Date().toISOString() });
});

// Debug endpoint to test CORS
app.get('/api/debug/cors', (req, res) => {
  console.log('🔍 Debug CORS request from origin:', req.headers.origin);
  res.json({ 
    message: 'CORS test successful',
    origin: req.headers.origin,
    allowedOrigins: config.getAllowedOrigins(),
    timestamp: new Date().toISOString() 
  });
});

// Debug endpoint to check environment
app.get('/api/debug/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_URL: process.env.CLIENT_URL,
    RENDER_FRONTEND_URL: process.env.RENDER_FRONTEND_URL,
    allowedOrigins: config.getAllowedOrigins(),
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = config.port;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server running`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log('🔗 CORS allowed origins:', config.getAllowedOrigins());
  
  // Setup ngrok tunnel
  const ngrokUrl = await setupNgrok();
  
  if (ngrokUrl) {
    console.log('✅ Ngrok tunnel established successfully');
  } else {
    console.log('🚀 Running without ngrok (production mode)');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
