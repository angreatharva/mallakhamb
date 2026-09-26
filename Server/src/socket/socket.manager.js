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
const { isTokenLoggedOut } = require('../utils/security/token-invalidation.util');
const { COOKIE_NAMES } = require('../utils/security/cookie.util');
const {
  assignmentCompetitionTypes,
  scoringRoomIds,
  normalizeCompetitionType,
} = require('../utils/data/scoring-room.util');

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
        // First check the explicit auth payload (backward compat / non-browser clients)
        let token = socket.handshake.auth.token;

        // If not found, check the cookie manually
        if (!token && socket.request.headers.cookie) {
          const cookieStr = socket.request.headers.cookie;
          const match = cookieStr.match(new RegExp('(^|;\\s*)' + COOKIE_NAMES.ACCESS_TOKEN + '=([^;]+)'));
          if (match) {
            token = decodeURIComponent(match[2]);
          }
        }

        if (!token) {
          this.logger.warn('Socket connection attempt without token', {
            socketId: socket.id
          });
          return next(new Error('Authentication token required'));
        }

        // Verify token using TokenService
        const decoded = this.tokenService.verifyToken(token);

        // Check if token was issued before the user logged out
        if (
          decoded.userId != null &&
          typeof decoded.iat === 'number' &&
          await isTokenLoggedOut(String(decoded.userId), decoded.iat)
        ) {
          this.logger.warn('Socket connection rejected: token invalidated after logout', {
            socketId: socket.id,
            userId: decoded.userId
          });
          return next(new Error('Session ended. Please log in again.'));
        }

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
  async handleConnection(socket) {
    this.logger.info('User connected', {
      socketId: socket.id,
      userId: socket.userId,
      userType: socket.userType,
      competitionId: socket.competitionId
    });

    // Track connection in metrics
    if (this.metricsCollector) {
      this.metricsCollector.trackSocketConnection(1);
    }

    // Store user connection mapping (Set of socket.ids per userId)
    if (!this.connectedUsers.has(socket.userId)) {
      this.connectedUsers.set(socket.userId, new Set());
    }
    this.connectedUsers.get(socket.userId).add(socket.id);

    // Auto-join judges to their assigned scoring room
    if (socket.userType === 'judge') {
      await this.autoJoinJudgeRoom(socket);
    }

    // Auto-join this socket's own competition room, from the trusted JWT
    // claim stamped at handshake. Without this, nothing ever joins
    // `competition_{id}` — several real broadcasts (team approval/rejection,
    // age-group start/end, score lock/unlock, competition update) target this
    // room and previously reached nobody. A socket with no competitionId
    // claim (e.g. a coach/admin who hasn't selected one yet) joins nothing
    // here; see handleJoinCompetitionRoom for the explicit join a client can
    // call after `/auth/set-competition`.
    if (socket.competitionId) {
      const competitionRoomId = `competition_${socket.competitionId}`;
      socket.join(competitionRoomId);
      this.logger.debug('Socket auto-joined its competition room', {
        socketId: socket.id,
        userId: socket.userId,
        roomId: competitionRoomId,
      });
    }

    // Register all event handlers for this socket
    this.registerSocketEvents(socket);

    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnection(socket));
  }

  /**
   * Compute the scoring rooms a single judge assignment entitles its holder to.
   *
   * Returns BOTH room-id forms, because the codebase addresses the same room as
   * `scoring_Male_Under18_competition_1` (slug) and
   * `scoring_Male_Under18_Competition I` (display). Any authorization check that
   * handles only one form would reject legitimate judges.
   *
   * @param {Object} assignment - A judge assignment ({ gender, ageGroup, competitionTypes })
   * @returns {string[]} Room ids, possibly empty
   */
  getRoomIdsForAssignment(assignment) {
    const { gender, ageGroup, competitionTypes } = assignment || {};

    // `scoringRoomIds` returns [] for an incomplete category, so an assignment
    // missing gender or ageGroup still yields no rooms.
    return assignmentCompetitionTypes(competitionTypes)
      .flatMap((compType) => scoringRoomIds(gender, ageGroup, compType));
  }

  /**
   * Normalize judge details into the assignment list used everywhere else.
   * @param {Object} judgeDetails - Result of authorizationService.getJudgeDetails
   * @returns {Object[]}
   */
  getJudgeAssignments(judgeDetails) {
    if (!judgeDetails) return [];
    return (judgeDetails.assignments && judgeDetails.assignments.length > 0)
      ? judgeDetails.assignments
      : [judgeDetails];
  }

  /**
   * HIGH-5: is this judge socket entitled to act in `roomId`?
   *
   * Room membership used to be gated on ROLE alone, so any authenticated judge
   * could join `scoring_Male_Under14_competition_1` — including one assigned to
   * a different competition, gender or age group — and broadcast forged
   * `score_updated` events into a live Panel Review.
   *
   * The entitled set is exactly the set auto-join uses, so there is only one
   * predicate and it cannot drift. Results are cached on the socket to avoid a
   * database read per score event; the cache is populated at connect time.
   *
   * @param {Socket} socket - Authenticated socket
   * @param {string} roomId - Room the socket wants to act in
   * @returns {Promise<boolean>}
   */
  async isJudgeAuthorizedForRoom(socket, roomId) {
    if (!roomId) return false;

    if (!socket.judgeRoomIds) {
      // Auto-join may have failed or been skipped; resolve lazily.
      await this.cacheJudgeAssignments(socket);
    }

    return socket.judgeRoomIds instanceof Set && socket.judgeRoomIds.has(roomId);
  }

  /**
   * Resolve and cache a judge socket's assignments, entitled rooms and the
   * judgeType per room. Safe to call more than once.
   * @param {Socket} socket - Authenticated judge socket
   * @returns {Promise<Object|null>} judgeDetails, or null when unavailable
   */
  async cacheJudgeAssignments(socket) {
    const judgeDetails = await this.authorizationService.getJudgeDetails(socket.userId);

    if (!judgeDetails) {
      socket.judgeRoomIds = new Set();
      socket.judgeTypeByRoom = new Map();
      socket.judgeTypesByRoom = new Map();
      return null;
    }

    const roomIds = new Set();
    const judgeTypeByRoom = new Map();
    const judgeTypesByRoom = new Map();

    for (const assignment of this.getJudgeAssignments(judgeDetails)) {
      for (const roomId of this.getRoomIdsForAssignment(assignment)) {
        roomIds.add(roomId);
        // A judge can hold different roles in different categories, so remember
        // the role per room rather than assuming one global judgeType.
        judgeTypeByRoom.set(roomId, assignment.judgeType || judgeDetails.judgeType);
        // EVERY seat held in the room, too. One room is a whole category and
        // carries all its apparatus panels, so a person can be Time Keeper on
        // Pole and Judge 1 on Rope there — the single map above keeps only the
        // last one it saw.
        if (!judgeTypesByRoom.has(roomId)) judgeTypesByRoom.set(roomId, new Set());
        judgeTypesByRoom.get(roomId).add(assignment.judgeType || judgeDetails.judgeType);
      }
    }

    socket.judgeRoomIds = roomIds;
    socket.judgeTypeByRoom = judgeTypeByRoom;
    socket.judgeTypesByRoom = judgeTypesByRoom;
    socket.judgeType = judgeDetails.judgeType;
    // Server-side identity for broadcasts that name the sender (the Time
    // Keeper's name on the Scorer's sheet) — never the name a client claims.
    socket.judgeName = judgeDetails.name || null;

    return judgeDetails;
  }

  /**
   * Auto-join judge to their assigned scoring room
   * @param {Socket} socket - Socket.IO socket instance with authenticated judge
   */
  async autoJoinJudgeRoom(socket) {
    try {
      // Fetch judge details from authorizationService to get their assignment(s)
      const judgeDetails = await this.cacheJudgeAssignments(socket);

      if (!judgeDetails) {
        this.logger.warn('Judge details not found for auto-join', {
          socketId: socket.id,
          userId: socket.userId
        });
        return;
      }

      const assignments = this.getJudgeAssignments(judgeDetails);

      for (const assignment of assignments) {
        const { gender, ageGroup, competitionTypes, apparatus, judgeType } = assignment;
        
        if (!gender || !ageGroup) {
          this.logger.warn('Judge assignment missing gender/ageGroup', {
            socketId: socket.id,
            userId: socket.userId,
            gender,
            ageGroup
          });
          continue;
        }

        for (const compType of assignmentCompetitionTypes(competitionTypes)) {
          // Both room-id forms come from the same helper the authorization
          // check uses (getRoomIdsForAssignment, above), so a judge can never
          // be auto-joined to a room they would then be refused permission to
          // act in.
          const roomIds = scoringRoomIds(gender, ageGroup, compType);
          for (const roomId of roomIds) {
            socket.join(roomId);
          }

          this.logger.info('Judge auto-joined scoring room', {
            socketId: socket.id,
            userId: socket.userId,
            judgeId: judgeDetails._id,
            judgeName: judgeDetails.name,
            judgeType: judgeType || judgeDetails.judgeType,
            roomIds,
            gender,
            ageGroup,
            competitionType: compType,
            apparatus
          });

          // Notify the judge client that they've joined the room. The RAW form
          // is reported because that is the one the client addresses its own
          // broadcasts to; `scoringRoomIds` returns it first for that reason.
          socket.emit('room_joined', {
            roomId: roomIds[0],
            message: 'Automatically joined your assigned scoring room',
            assignment: {
              gender,
              ageGroup,
              competitionType: compType,
              apparatus,
              judgeType: judgeType || judgeDetails.judgeType
            }
          });
        }
      }
    } catch (error) {
      this.logger.error('Error auto-joining judge to room', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Normalize competition type from database format to display format.
   *
   * Delegates to the shared helper. This used to carry its own slug→display
   * table that ran to "Competition V" — two categories more than either the
   * Competition or the Score enum permits — and which could drift from the
   * canonical map in `config/cop-rules`.
   *
   * @param {string} compType - Competition type (e.g., "competition_1", "Competition I")
   * @returns {string} Normalized competition type
   */
  normalizeCompetitionType(compType) {
    return normalizeCompetitionType(compType);
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
    if (this.metricsCollector) {
      this.metricsCollector.trackSocketConnection(-1);
    }

    // Remove user connection mapping from Set
    if (this.connectedUsers.has(socket.userId)) {
      const userSockets = this.connectedUsers.get(socket.userId);
      if (userSockets instanceof Set) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(socket.userId);
        }
      } else {
        this.connectedUsers.delete(socket.userId);
      }
    }
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
          this.logger.debug('Socket event received', {
            eventName,
            socketId: socket.id,
            userId: socket.userId,
            data
          });

          // Track event in metrics
          if (this.metricsCollector) {
            this.metricsCollector.trackSocketEvent();
          }

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

    const userSockets = this.connectedUsers.get(userId);
    
    if (!userSockets) {
      this.logger.warn('User not connected', { userId, eventName });
      return;
    }

    if (userSockets instanceof Set) {
      for (const socketId of userSockets) {
        this.io.to(socketId).emit(eventName, data);
      }
    } else {
      this.io.to(userSockets).emit(eventName, data);
    }

    this.logger.debug('Event emitted to user', {
      userId,
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
    const userSockets = this.connectedUsers.get(userId);
    
    if (!userSockets) {
      this.logger.warn('Cannot disconnect user: not connected', { userId });
      return;
    }

    const ids = userSockets instanceof Set ? Array.from(userSockets) : [userSockets];
    for (const socketId of ids) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }
    this.connectedUsers.delete(userId);
    this.logger.info('User disconnected by server', { userId });
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
