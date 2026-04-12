/**
 * Socket Manager Unit Tests
 * 
 * Tests Socket.IO manager functionality including:
 * - Authentication middleware
 * - Event registration and handling
 * - Emit helpers
 * 
 * Requirements: 15.1, 15.8
 */

const SocketManager = require('./socket.manager');
const { AuthenticationError } = require('../errors');

describe('SocketManager', () => {
  let socketManager;
  let mockHttpServer;
  let mockTokenService;
  let mockAuthorizationService;
  let mockConfig;
  let mockLogger;
  let mockMetricsCollector;
  let mockSocket;
  let mockIO;

  beforeEach(() => {
    // Mock HTTP server with full EventEmitter interface
    const EventEmitter = require('events');
    mockHttpServer = new EventEmitter();
    mockHttpServer.listen = jest.fn();

    // Mock token service
    mockTokenService = {
      verifyToken: jest.fn()
    };

    // Mock authorization service
    mockAuthorizationService = {
      canJudgeScore: jest.fn()
    };

    // Mock config
    mockConfig = {
      get: jest.fn((key) => {
        if (key === 'server.corsOrigins') {
          return ['http://localhost:3000'];
        }
        return null;
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock metrics collector
    mockMetricsCollector = {
      trackSocketConnection: jest.fn(),
      trackSocketEvent: jest.fn()
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        auth: {
          token: 'valid-token'
        }
      },
      userId: null,
      userType: null,
      competitionId: null,
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn()
      })),
      on: jest.fn()
    };

    // Mock Socket.IO server
    mockIO = {
      use: jest.fn(),
      on: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn()
      })),
      emit: jest.fn(),
      close: jest.fn(),
      sockets: {
        sockets: new Map()
      }
    };

    // Create socket manager instance
    socketManager = new SocketManager(
      mockHttpServer,
      mockTokenService,
      mockAuthorizationService,
      mockConfig,
      mockLogger,
      mockMetricsCollector
    );
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server with CORS configuration', () => {
      const io = socketManager.initialize();

      expect(io).toBeDefined();
      expect(socketManager.io).toBeDefined();
      expect(socketManager.getIO()).toBe(io);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Socket.IO server initialized',
        expect.objectContaining({
          allowedOrigins: ['http://localhost:3000']
        })
      );
    });

    it('should not reinitialize if already initialized', () => {
      socketManager.io = mockIO;

      const result = socketManager.initialize();

      expect(result).toBe(mockIO);
      expect(mockLogger.warn).toHaveBeenCalledWith('Socket.IO server already initialized');
    });
  });

  describe('createAuthMiddleware', () => {
    it('should authenticate socket with valid token', async () => {
      const middleware = socketManager.createAuthMiddleware();
      const next = jest.fn();

      mockTokenService.verifyToken.mockReturnValue({
        userId: 'user-123',
        userType: 'judge',
        competitionId: 'comp-456'
      });

      await middleware(mockSocket, next);

      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect(mockSocket.userId).toBe('user-123');
      expect(mockSocket.userType).toBe('judge');
      expect(mockSocket.competitionId).toBe('comp-456');
      expect(next).toHaveBeenCalledWith();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Socket authenticated',
        expect.objectContaining({
          userId: 'user-123',
          userType: 'judge'
        })
      );
    });

    it('should reject socket without token', async () => {
      const middleware = socketManager.createAuthMiddleware();
      const next = jest.fn();
      mockSocket.handshake.auth.token = null;

      await middleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Authentication token required'));
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should reject socket with invalid token', async () => {
      const middleware = socketManager.createAuthMiddleware();
      const next = jest.fn();

      mockTokenService.verifyToken.mockImplementation(() => {
        throw new AuthenticationError('Invalid token');
      });

      await middleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Invalid token'));
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle token verification errors', async () => {
      const middleware = socketManager.createAuthMiddleware();
      const next = jest.fn();

      mockTokenService.verifyToken.mockImplementation(() => {
        throw new Error('Token verification failed');
      });

      await middleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(new Error('Authentication failed'));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handleConnection', () => {
    beforeEach(() => {
      socketManager.io = mockIO;
      mockSocket.userId = 'user-123';
      mockSocket.userType = 'judge';
      mockSocket.competitionId = 'comp-456';
    });

    it('should handle new connection', () => {
      socketManager.registerSocketEvents = jest.fn();

      socketManager.handleConnection(mockSocket);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User connected',
        expect.objectContaining({
          socketId: 'socket-123',
          userId: 'user-123',
          userType: 'judge'
        })
      );
      expect(mockMetricsCollector.trackSocketConnection).toHaveBeenCalledWith(1);
      expect(socketManager.connectedUsers.get('user-123')).toBe('socket-123');
      expect(socketManager.registerSocketEvents).toHaveBeenCalledWith(mockSocket);
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('handleDisconnection', () => {
    beforeEach(() => {
      mockSocket.userId = 'user-123';
      mockSocket.userType = 'judge';
      socketManager.connectedUsers.set('user-123', 'socket-123');
    });

    it('should handle disconnection', () => {
      socketManager.handleDisconnection(mockSocket);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User disconnected',
        expect.objectContaining({
          socketId: 'socket-123',
          userId: 'user-123'
        })
      );
      expect(mockMetricsCollector.trackSocketConnection).toHaveBeenCalledWith(-1);
      expect(socketManager.connectedUsers.has('user-123')).toBe(false);
    });
  });

  describe('registerEventHandler', () => {
    it('should register event handler', () => {
      const handler = jest.fn();

      socketManager.registerEventHandler('test_event', handler);

      expect(socketManager.eventHandlers.get('test_event')).toBe(handler);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Event handler registered',
        { eventName: 'test_event' }
      );
    });

    it('should throw error if handler is not a function', () => {
      expect(() => {
        socketManager.registerEventHandler('test_event', 'not-a-function');
      }).toThrow("Event handler for 'test_event' must be a function");
    });
  });

  describe('registerSocketEvents', () => {
    it('should register all event handlers for socket', async () => {
      const handler1 = jest.fn().mockResolvedValue();
      const handler2 = jest.fn().mockResolvedValue();

      socketManager.registerEventHandler('event1', handler1);
      socketManager.registerEventHandler('event2', handler2);

      socketManager.registerSocketEvents(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('event1', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('event2', expect.any(Function));
    });

    it('should handle event execution and track metrics', async () => {
      const handler = jest.fn().mockResolvedValue();
      socketManager.registerEventHandler('test_event', handler);

      socketManager.registerSocketEvents(mockSocket);

      // Get the registered callback
      const callback = mockSocket.on.mock.calls.find(
        call => call[0] === 'test_event'
      )[1];

      // Execute the callback
      await callback({ data: 'test' });

      expect(mockMetricsCollector.trackSocketEvent).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(mockSocket, { data: 'test' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Socket event received',
        expect.any(Object)
      );
    });

    it('should handle event handler errors', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      socketManager.registerEventHandler('test_event', handler);

      socketManager.registerSocketEvents(mockSocket);

      // Get the registered callback
      const callback = mockSocket.on.mock.calls.find(
        call => call[0] === 'test_event'
      )[1];

      // Execute the callback
      await callback({ data: 'test' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Socket event handler error',
        expect.objectContaining({
          eventName: 'test_event',
          error: 'Handler error'
        })
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Handler error',
        eventName: 'test_event'
      });
    });
  });

  describe('joinRoom', () => {
    it('should join room without validator', async () => {
      const result = await socketManager.joinRoom(mockSocket, 'room-123');

      expect(mockSocket.join).toHaveBeenCalledWith('room-123');
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User joined room',
        expect.objectContaining({
          roomId: 'room-123'
        })
      );
    });

    it('should join room with successful validation', async () => {
      const validator = jest.fn().mockResolvedValue(true);

      const result = await socketManager.joinRoom(mockSocket, 'room-123', validator);

      expect(validator).toHaveBeenCalledWith(mockSocket, 'room-123');
      expect(mockSocket.join).toHaveBeenCalledWith('room-123');
      expect(result).toBe(true);
    });

    it('should reject join with failed validation', async () => {
      const validator = jest.fn().mockResolvedValue(false);

      const result = await socketManager.joinRoom(mockSocket, 'room-123', validator);

      expect(validator).toHaveBeenCalledWith(mockSocket, 'room-123');
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should reject invalid room ID', async () => {
      const result = await socketManager.joinRoom(mockSocket, null);

      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('leaveRoom', () => {
    it('should leave room', () => {
      socketManager.leaveRoom(mockSocket, 'room-123');

      expect(mockSocket.leave).toHaveBeenCalledWith('room-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User left room',
        expect.objectContaining({
          roomId: 'room-123'
        })
      );
    });
  });

  describe('emitToRoom', () => {
    beforeEach(() => {
      socketManager.io = mockIO;
    });

    it('should emit event to room', () => {
      const mockRoomEmit = jest.fn();
      mockIO.to.mockReturnValue({ emit: mockRoomEmit });

      socketManager.emitToRoom('room-123', 'test_event', { data: 'test' });

      expect(mockIO.to).toHaveBeenCalledWith('room-123');
      expect(mockRoomEmit).toHaveBeenCalledWith('test_event', { data: 'test' });
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle emit when Socket.IO not initialized', () => {
      socketManager.io = null;

      socketManager.emitToRoom('room-123', 'test_event', { data: 'test' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cannot emit to room: Socket.IO not initialized'
      );
    });
  });

  describe('emitToUser', () => {
    beforeEach(() => {
      socketManager.io = mockIO;
      socketManager.connectedUsers.set('user-123', 'socket-123');
    });

    it('should emit event to connected user', () => {
      const mockUserEmit = jest.fn();
      mockIO.to.mockReturnValue({ emit: mockUserEmit });

      socketManager.emitToUser('user-123', 'test_event', { data: 'test' });

      expect(mockIO.to).toHaveBeenCalledWith('socket-123');
      expect(mockUserEmit).toHaveBeenCalledWith('test_event', { data: 'test' });
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle emit to disconnected user', () => {
      socketManager.emitToUser('user-999', 'test_event', { data: 'test' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'User not connected',
        expect.objectContaining({
          userId: 'user-999'
        })
      );
    });

    it('should handle emit when Socket.IO not initialized', () => {
      socketManager.io = null;

      socketManager.emitToUser('user-123', 'test_event', { data: 'test' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cannot emit to user: Socket.IO not initialized'
      );
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      socketManager.io = mockIO;
    });

    it('should broadcast event to all clients', () => {
      socketManager.broadcast('test_event', { data: 'test' });

      expect(mockIO.emit).toHaveBeenCalledWith('test_event', { data: 'test' });
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle broadcast when Socket.IO not initialized', () => {
      socketManager.io = null;

      socketManager.broadcast('test_event', { data: 'test' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cannot broadcast: Socket.IO not initialized'
      );
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      socketManager.io = mockIO;
      socketManager.connectedUsers.set('user-1', 'socket-1');
      socketManager.connectedUsers.set('user-2', 'socket-2');
    });

    it('should get Socket.IO instance', () => {
      expect(socketManager.getIO()).toBe(mockIO);
    });

    it('should get connected users count', () => {
      expect(socketManager.getConnectedUsersCount()).toBe(2);
    });

    it('should check if user is connected', () => {
      expect(socketManager.isUserConnected('user-1')).toBe(true);
      expect(socketManager.isUserConnected('user-999')).toBe(false);
    });

    it('should get connected user IDs', () => {
      const userIds = socketManager.getConnectedUserIds();
      expect(userIds).toEqual(['user-1', 'user-2']);
    });

    it('should disconnect user', () => {
      const mockSocket = {
        disconnect: jest.fn()
      };
      mockIO.sockets.sockets.set('socket-1', mockSocket);

      socketManager.disconnectUser('user-1');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User disconnected by server',
        expect.objectContaining({
          userId: 'user-1',
          socketId: 'socket-1'
        })
      );
    });

    it('should handle disconnect for non-connected user', () => {
      socketManager.disconnectUser('user-999');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot disconnect user: not connected',
        { userId: 'user-999' }
      );
    });
  });

  describe('close', () => {
    it('should close Socket.IO server', () => {
      socketManager.io = mockIO;

      socketManager.close();

      expect(mockIO.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Socket.IO server closed');
      expect(socketManager.io).toBeNull();
    });

    it('should handle close when not initialized', () => {
      socketManager.io = null;

      socketManager.close();

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
