/**
 * Socket.IO Manager
 * 
 * Manages Socket.IO server lifecycle, authentication, event handling, and room management.
 * Provides a clean abstraction for real-time communication.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8
 */

const { Server } = require('socket.io');
const { AuthenticationError } = require('../errors');

class SocketManager {
  /**
   * Create a Socket.IO manager
   * @param {http.Server} httpServer - HTTP server instance
   * @param {TokenService} tokenService - Token service for authentication
   * @param {AuthorizationService} authorizationService - Authorization service
   * @param {ConfigManager} config - Configuration manager
   * @param {Logger} logger - Logger instance
   * @param {MetricsCollector} metricsCollector - Metrics collector
   */
  constructor(httpServer, tokenService, authorizationService, config, logger, metricsCollector) {
    this.httpServer = httpServer;
    this.tokenService = tokenService;
    this.authorizationService = authorizationService;
    this.config = config;
    this.logger = logger;
    this.metricsCollector = metricsCollector;
    
    this.io = null;
    this.eventHandlers = new Map();
    this.connectedUsers = new Map(); // userId -> socket.id mapping
  }

  /**
   * Initialize Socket.IO server with CORS configuration
   * @returns {Server} Socket.IO server instance
   */
  initialize() {
    if (this.io) {
      this.logger.warn('Socket.IO server already initialized');
      return this.io;
    }

    // Get CORS origins from config
    const allowedOrigins = this.config.get('server.corsOrigins') || [];

    // Initialize Socket.IO server with CORS
    this.io = new Server(this.httpServer, {
      cors: {
        origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      // Connection timeout
      connectTimeout: 10000,
      // Ping timeout
      pingTimeout: 5000,
      pingInterval: 25000
    });

    // Apply authentication middleware
    this.io.use(this.createAuthMiddleware());

    // Handle connections
    this.io.on('connection', this.handleConnection.bind(this));

    this.logger.info('Socket.IO server initialized', {
      allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['*']
    });

    return this.io;
  }

  /**
   * Create authentication middleware for Socket.IO
   * @returns {Function} Middleware function
   */
  createAuthMiddleware() {
    return async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          this.logger.warn('Socket connection attempt without token', {
            socketId: socket.id
          });
          return next(new Error('Authentication token required'));
        }

        // Verify token using TokenService
        const decoded = this.tokenService.verifyToken(token);

        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.userType = decoded.userType;
        socket.competitionId = decoded.competitionId || null;

        this.logger.debug('Socket authenticated', {
          socketId: socket.id,
          userId: decoded.userId,
          userType: decoded.userType,
          competitionId: decoded.competitionId
        });

        next();
      } catch (error) {
        this.logger.error('Socket authentication failed', {
          socketId: socket.id,
          error: error.message
        });

        if (error instanceof AuthenticationError) {
          return next(new Error(error.message));
        }

        return next(new Error('Authentication failed'));
      }
    };
  }

  /**
   * Handle new socket connection
   * @param {Socket} socket - Socket.IO socket instance
   */
  handleConnection(socket) {
    this.logger.info('User connected', {
      socketId: socket.id,
      userId: socket.userId,
      userType: socket.userType,
      competitionId: socket.competitionId
    });

    // Track connection in metrics
    this.metricsCollector.trackSocketConnection(1);

    // Store user connection mapping
    this.connectedUsers.set(socket.userId, socket.id);

    // Register all event handlers for this socket
    this.registerSocketEvents(socket);

    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnection(socket));
  }

  /**
   * Handle socket disconnection
   * @param {Socket} socket - Socket.IO socket instance
   */
  handleDisconnection(socket) {
    this.logger.info('User disconnected', {
      socketId: socket.id,
      userId: socket.userId,
      userType: socket.userType
    });

    // Track disconnection in metrics
    this.metricsCollector.trackSocketConnection(-1);

    // Remove user connection mapping
    this.connectedUsers.delete(socket.userId);
  }

  /**
   * Register an event handler
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler function (socket, data) => Promise<void>
   */
  registerEventHandler(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Event handler for '${eventName}' must be a function`);
    }

    this.eventHandlers.set(eventName, handler);
    this.logger.debug('Event handler registered', { eventName });
  }

  /**
   * Register all event handlers for a socket
   * @param {Socket} socket - Socket.IO socket instance
   */
  registerSocketEvents(socket) {
    for (const [eventName, handler] of this.eventHandlers) {
      socket.on(eventName, async (data) => {
        try {
          // Track event in metrics
          this.metricsCollector.trackSocketEvent();

          this.logger.debug('Socket event received', {
            eventName,
            socketId: socket.id,
            userId: socket.userId,
            data
          });

          // Execute handler
          await handler(socket, data);
        } catch (error) {
          this.logger.error('Socket event handler error', {
            eventName,
            socketId: socket.id,
            userId: socket.userId,
            error: error.message,
            stack: error.stack
          });

          // Emit error to client
          socket.emit('error', {
            message: error.message || 'An error occurred processing your request',
            eventName
          });
        }
      });
    }
  }

  /**
   * Join a room with validation
   * @param {Socket} socket - Socket.IO socket instance
   * @param {string} roomId - Room ID to join
   * @param {Function} validator - Optional validation function (socket, roomId) => Promise<boolean>
   * @returns {Promise<boolean>} True if joined successfully
   */
  async joinRoom(socket, roomId, validator = null) {
    try {
      // Validate room ID
      if (!roomId || typeof roomId !== 'string') {
        throw new Error('Invalid room ID');
      }

      // Run custom validator if provided
      if (validator && typeof validator === 'function') {
        const isValid = await validator(socket, roomId);
        if (!isValid) {
          throw new Error('Not authorized to join this room');
        }
      }

      // Join the room
      socket.join(roomId);

      this.logger.info('User joined room', {
        socketId: socket.id,
        userId: socket.userId,
        userType: socket.userType,
        roomId
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to join room', {
        socketId: socket.id,
        userId: socket.userId,
        roomId,
        error: error.message
      });

      socket.emit('error', {
        message: error.message,
        action: 'join_room',
        roomId
      });

      return false;
    }
  }

  /**
   * Leave a room
   * @param {Socket} socket - Socket.IO socket instance
   * @param {string} roomId - Room ID to leave
   */
  leaveRoom(socket, roomId) {
    socket.leave(roomId);

    this.logger.info('User left room', {
      socketId: socket.id,
      userId: socket.userId,
      roomId
    });
  }

  /**
   * Emit event to a specific room
   * @param {string} roomId - Room ID
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   */
  emitToRoom(roomId, eventName, data) {
    if (!this.io) {
      this.logger.error('Cannot emit to room: Socket.IO not initialized');
      return;
    }

    this.io.to(roomId).emit(eventName, data);

    this.logger.debug('Event emitted to room', {
      roomId,
      eventName,
      data
    });
  }

  /**
   * Emit event to a specific user
   * @param {string} userId - User ID
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   */
  emitToUser(userId, eventName, data) {
    if (!this.io) {
      this.logger.error('Cannot emit to user: Socket.IO not initialized');
      return;
    }

    const socketId = this.connectedUsers.get(userId);
    
    if (!socketId) {
      this.logger.warn('User not connected', { userId, eventName });
      return;
    }

    this.io.to(socketId).emit(eventName, data);

    this.logger.debug('Event emitted to user', {
      userId,
      socketId,
      eventName,
      data
    });
  }

  /**
   * Broadcast event to all connected clients
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   */
  broadcast(eventName, data) {
    if (!this.io) {
      this.logger.error('Cannot broadcast: Socket.IO not initialized');
      return;
    }

    this.io.emit(eventName, data);

    this.logger.debug('Event broadcasted', {
      eventName,
      data
    });
  }

  /**
   * Get Socket.IO server instance
   * @returns {Server|null} Socket.IO server instance
   */
  getIO() {
    return this.io;
  }

  /**
   * Get connected users count
   * @returns {number} Number of connected users
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID
   * @returns {boolean} True if user is connected
   */
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get all connected user IDs
   * @returns {string[]} Array of user IDs
   */
  getConnectedUserIds() {
    return Array.from(this.connectedUsers.keys());
  }

  /**
   * Disconnect a specific user
   * @param {string} userId - User ID to disconnect
   */
  disconnectUser(userId) {
    const socketId = this.connectedUsers.get(userId);
    
    if (!socketId) {
      this.logger.warn('Cannot disconnect user: not connected', { userId });
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    
    if (socket) {
      socket.disconnect(true);
      this.logger.info('User disconnected by server', { userId, socketId });
    }
  }

  /**
   * Close Socket.IO server
   */
  close() {
    if (this.io) {
      this.io.close();
      this.logger.info('Socket.IO server closed');
      this.io = null;
    }
  }
}

module.exports = SocketManager;
