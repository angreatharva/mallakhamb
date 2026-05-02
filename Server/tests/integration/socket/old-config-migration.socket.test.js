/**
 * Old-Config Migration Socket.IO Integration Tests
 * 
 * Feature: old-config-migration
 * Tests Socket.IO scoring room authorization changes
 * 
 * Requirements validated:
 * - 5.2: Authorized user types (judge, admin, superadmin) can join scoring rooms
 * - 5.3: Unauthorized user types (coach, player) cannot join scoring rooms
 * - 5.4: Judges can emit score_update events
 * - 5.5: Non-judges cannot emit score_update events
 */

const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const SocketManager = require('../../../src/socket/socket.manager');
const ScoringHandler = require('../../../src/socket/handlers/scoring.handler');

describe('Old-Config Migration Socket.IO Integration Tests', () => {
  let httpServer;
  let io;
  let serverSocket;
  let clientSocket;
  let mockTokenService;
  let mockAuthorizationService;
  let mockScoringService;
  let mockJudgeService;
  let mockLogger;
  let mockMetricsCollector;
  let socketManager;
  let scoringHandler;
  let port;

  beforeEach((done) => {
    // Create HTTP server
    httpServer = http.createServer();
    port = 3000 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts

    // Mock services
    mockTokenService = {
      verifyToken: jest.fn((token) => {
        if (token === 'judge-token') {
          return { userId: 'judge123', userType: 'judge', competitionId: 'comp123' };
        }
        if (token === 'admin-token') {
          return { userId: 'admin123', userType: 'admin', competitionId: 'comp123' };
        }
        if (token === 'superadmin-token') {
          return { userId: 'superadmin123', userType: 'superadmin', competitionId: 'comp123' };
        }
        if (token === 'coach-token') {
          return { userId: 'coach123', userType: 'coach', competitionId: 'comp123' };
        }
        if (token === 'player-token') {
          return { userId: 'player123', userType: 'player', competitionId: 'comp123' };
        }
        throw new Error('Invalid token');
      })
    };

    mockAuthorizationService = {
      canAccessCompetition: jest.fn(() => Promise.resolve(true)),
      canManageScores: jest.fn(() => Promise.resolve(true)),
      canJudgeScore: jest.fn(() => Promise.resolve(true)),
    };

    mockScoringService = {
      updateScore: jest.fn(() => Promise.resolve({ success: true })),
      saveScores: jest.fn(() => Promise.resolve({ success: true })),
    };

    mockJudgeService = {
      getJudgeProfile: jest.fn(() => Promise.resolve({
        _id: 'judge123',
        username: 'judge_test',
        judgeType: 'senior',
        competition: 'comp123'
      })),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockMetricsCollector = {
      recordSocketConnection: jest.fn(),
      recordSocketDisconnection: jest.fn(),
      recordSocketEvent: jest.fn(),
      trackSocketConnection: jest.fn(),
      trackSocketDisconnection: jest.fn(),
      trackSocketEvent: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key) => {
        if (key === 'cors.origin') return '*';
        if (key === 'cors.credentials') return true;
        return null;
      })
    };

    // Create Socket.IO server using SocketManager
    socketManager = new SocketManager(
      httpServer,
      mockTokenService,
      mockAuthorizationService,
      mockConfig,
      mockLogger,
      mockMetricsCollector
    );

    socketManager.initialize();
    io = socketManager.io;

    // Create scoring handler
    scoringHandler = new ScoringHandler(
      socketManager,
      mockScoringService,
      mockAuthorizationService,
      mockLogger,
      mockJudgeService
    );

    scoringHandler.register();

    // Start server
    httpServer.listen(port, () => {
      done();
    });
  });

  afterEach((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close(() => {
        done();
      });
    } else {
      done();
    }
  });

  const createClient = (token) => {
    return Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  };

  describe('Requirement 5.2: Authorized user types can join scoring rooms', () => {
    it('Connect as judge → emit join_scoring_room → assert room_joined event received', (done) => {
      clientSocket = createClient('judge-token');

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);

        clientSocket.emit('join_scoring_room', { roomId: 'room123' });

        clientSocket.on('room_joined', (data) => {
          expect(data).toHaveProperty('roomId', 'room123');
          expect(data).toHaveProperty('message');
          done();
        });

        clientSocket.on('error', (error) => {
          done(new Error(`Should not receive error: ${error.message}`));
        });
      });

      clientSocket.on('connect_error', (error) => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    it('Connect as admin → emit join_scoring_room → assert room_joined event received', (done) => {
      clientSocket = createClient('admin-token');

      clientSocket.on('connect', () => {
        clientSocket.emit('join_scoring_room', { roomId: 'room123' });

        clientSocket.on('room_joined', (data) => {
          expect(data).toHaveProperty('roomId', 'room123');
          done();
        });

        clientSocket.on('error', (error) => {
          done(new Error(`Should not receive error: ${error.message}`));
        });
      });
    });

    it('Connect as superadmin → emit join_scoring_room → assert room_joined event received', (done) => {
      clientSocket = createClient('superadmin-token');

      clientSocket.on('connect', () => {
        clientSocket.emit('join_scoring_room', { roomId: 'room123' });

        clientSocket.on('room_joined', (data) => {
          expect(data).toHaveProperty('roomId', 'room123');
          done();
        });

        clientSocket.on('error', (error) => {
          done(new Error(`Should not receive error: ${error.message}`));
        });
      });
    });
  });

  describe('Requirement 5.3: Unauthorized user types cannot join scoring rooms', () => {
    it('Connect as coach → emit join_scoring_room → assert error event received', (done) => {
      clientSocket = createClient('coach-token');

      clientSocket.on('connect', () => {
        clientSocket.emit('join_scoring_room', { roomId: 'room123' });

        clientSocket.on('error', (error) => {
          expect(error).toHaveProperty('message');
          expect(error.message).toContain('Not authorized to join this room');
          done();
        });

        clientSocket.on('room_joined', () => {
          done(new Error('Coach should not be able to join scoring room'));
        });
      });
    });

    it('Connect as player → emit join_scoring_room → assert error event received', (done) => {
      clientSocket = createClient('player-token');

      clientSocket.on('connect', () => {
        clientSocket.emit('join_scoring_room', { roomId: 'room123' });

        clientSocket.on('error', (error) => {
          expect(error).toHaveProperty('message');
          expect(error.message).toContain('Not authorized to join this room');
          done();
        });

        clientSocket.on('room_joined', () => {
          done(new Error('Player should not be able to join scoring room'));
        });
      });
    });
  });

  describe('Requirement 5.4, 5.5: Score update authorization', () => {
    it('Connect as judge → emit score_update → assert score_updated broadcast to room', (done) => {
      const judgeClient = createClient('judge-token');
      const observerClient = createClient('admin-token');

      let judgeJoined = false;
      let observerJoined = false;

      const checkBothJoined = () => {
        if (judgeJoined && observerJoined) {
          // Both clients in room, now emit score_update
          judgeClient.emit('score_update', {
            roomId: 'room123',
            playerId: 'player123',
            judgeType: 'senior',
            score: 8.5
          });
        }
      };

      judgeClient.on('connect', () => {
        judgeClient.emit('join_scoring_room', { roomId: 'room123' });
      });

      judgeClient.on('room_joined', () => {
        judgeJoined = true;
        checkBothJoined();
      });

      observerClient.on('connect', () => {
        observerClient.emit('join_scoring_room', { roomId: 'room123' });
      });

      observerClient.on('room_joined', () => {
        observerJoined = true;
        checkBothJoined();
      });

      // Observer should receive the broadcast
      observerClient.on('score_updated', (data) => {
        expect(data).toHaveProperty('playerId', 'player123');
        expect(data).toHaveProperty('judgeType', 'senior');
        expect(data).toHaveProperty('score', 8.5);
        
        judgeClient.disconnect();
        observerClient.disconnect();
        done();
      });

      judgeClient.on('error', (error) => {
        judgeClient.disconnect();
        observerClient.disconnect();
        done(new Error(`Judge received error: ${error.message}`));
      });
    });

    it('Connect as player → emit score_update → assert error event received', (done) => {
      clientSocket = createClient('player-token');

      clientSocket.on('connect', () => {
        // Try to emit score_update without joining room (or even if in room, should fail)
        clientSocket.emit('score_update', {
          roomId: 'room123',
          teamId: 'team123',
          playerId: 'player123',
          score: 8.5
        });

        clientSocket.on('error', (error) => {
          expect(error).toHaveProperty('message');
          expect(error.message).toContain('Only judges can update scores');
          done();
        });

        clientSocket.on('score_updated', () => {
          done(new Error('Player should not be able to update scores'));
        });
      });
    });

    it('Connect as coach → emit score_update → assert error event received', (done) => {
      clientSocket = createClient('coach-token');

      clientSocket.on('connect', () => {
        clientSocket.emit('score_update', {
          roomId: 'room123',
          teamId: 'team123',
          playerId: 'player123',
          score: 8.5
        });

        clientSocket.on('error', (error) => {
          expect(error).toHaveProperty('message');
          expect(error.message).toContain('Only judges can update scores');
          done();
        });

        clientSocket.on('score_updated', () => {
          done(new Error('Coach should not be able to update scores'));
        });
      });
    });
  });
});
