const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join scoring room
  socket.on('join_scoring_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });

  // Handle score updates
  socket.on('score_update', (data) => {
    // Broadcast to all users in the same room except sender
    socket.to(data.roomId).emit('score_updated', data);
    console.log('Score update broadcasted:', data);
  });

  // Handle scores saved event
  socket.on('scores_saved', (data) => {
    // Broadcast to all users in the same room
    io.to(data.roomId).emit('scores_saved_notification', data);
    console.log('Scores saved notification broadcasted:', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/players', require('./routes/playerRoutes'));
app.use('/api/coaches', require('./routes/coachRoutes'));
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Sports Event API is running!', timestamp: new Date().toISOString() });
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

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server running`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
