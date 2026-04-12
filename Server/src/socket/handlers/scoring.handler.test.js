/**
 * Scoring Handler Unit Tests
 * 
 * Tests scoring event handler functionality
 * 
 * Requirements: 15.1, 15.8
 */

const ScoringHandler = require('./scoring.handler');
const EventTypes = require('../events/event-types');

describe('ScoringHandler', () => {
  let scoringHandler;
  let mockSocketManager;
  let mockScoringService;
  let mockAuthorizationService;
  let mockLogger;
  let mockSocket;

  beforeEach(() => {
    // Mock socket manager
    mockSocketManager = {
      registerEventHandler: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
      emitToRoom: jest.fn()
    };

    // Mock scoring service
    mockScoringService = {
      submitScore: jest.fn(),
      updateScore: jest.fn()
    };

    // Mock authorization service
    mockAuthorizationService = {
      canJudgeScore: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      userId: 'judge-123',
      userType: 'judge',
      competitionId: 'comp-456',
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn()
      }))
    };

    scoringHandler = new ScoringHandler(
      mockSocketManager,
      mockScoringService,
      mockAuthorizationService,
      mockLogger
    );
  });

  describe('register', () => {
    it('should register all scoring event handlers', () => {
      scoringHandler.register();

      expect(mockSocketManager.registerEventHandler).toHaveBeenCalledWith(
        EventTypes.JOIN_SCORING_ROOM,
        expect.any(Function)
      );
      expect(mockSocketManager.registerEventHandler).toHaveBeenCalledWith(
        EventTypes.LEAVE_SCORING_ROOM,
        expect.any(Function)
      );
      expect(mockSocketManager.registerEventHandler).toHaveBeenCalledWith(
        EventTypes.SCORE_UPDATE,
        expect.any(Function)
      );
      expect(mockSocketManager.registerEventHandler).toHaveBeenCalledWith(
        EventTypes.SCORES_SAVED,
        expect.any(Function)
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Scoring event handlers registered');
    });
  });

  describe('handleJoinScoringRoom', () => {
    it('should allow judge to join scoring room', async () => {
      mockSocketManager.joinRoom.mockResolvedValue(true);

      await scoringHandler.handleJoinScoringRoom(mockSocket, {
        roomId: 'comp-456_male_u12_individual'
      });

      expect(mockSocketManager.joinRoom).toHaveBeenCalledWith(
        mockSocket,
        'comp-456_male_u12_individual',
        expect.any(Function)
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(EventTypes.ROOM_JOINED, {
        roomId: 'comp-456_male_u12_individual',
        message: 'Successfully joined scoring room'
      });
    });

    it('should allow admin to join scoring room', async () => {
      mockSocket.userType = 'admin';
      mockSocketManager.joinRoom.mockResolvedValue(true);

      await scoringHandler.handleJoinScoringRoom(mockSocket, {
        roomId: 'comp-456_male_u12_individual'
      });

      expect(mockSocketManager.joinRoom).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(EventTypes.ROOM_JOINED, expect.any(Object));
    });

    it('should allow coach to join scoring room', async () => {
      mockSocket.userType = 'coach';
      mockSocketManager.joinRoom.mockResolvedValue(true);

      await scoringHandler.handleJoinScoringRoom(mockSocket, {
        roomId: 'comp-456_male_u12_individual'
      });

      expect(mockSocketManager.joinRoom).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(EventTypes.ROOM_JOINED, expect.any(Object));
    });

    it('should throw error if room ID is missing', async () => {
      await expect(
        scoringHandler.handleJoinScoringRoom(mockSocket, {})
      ).rejects.toThrow('Room ID required');
    });

    it('should not emit success if join failed', async () => {
      mockSocketManager.joinRoom.mockResolvedValue(false);

      await scoringHandler.handleJoinScoringRoom(mockSocket, {
        roomId: 'comp-456_male_u12_individual'
      });

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleLeaveScoringRoom', () => {
    it('should leave scoring room', async () => {
      await scoringHandler.handleLeaveScoringRoom(mockSocket, {
        roomId: 'comp-456_male_u12_individual'
      });

      expect(mockSocketManager.leaveRoom).toHaveBeenCalledWith(
        mockSocket,
        'comp-456_male_u12_individual'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(EventTypes.ROOM_LEFT, {
        roomId: 'comp-456_male_u12_individual',
        message: 'Successfully left scoring room'
      });
    });

    it('should throw error if room ID is missing', async () => {
      await expect(
        scoringHandler.handleLeaveScoringRoom(mockSocket, {})
      ).rejects.toThrow('Room ID required');
    });
  });

  describe('handleScoreUpdate', () => {
    const scoreData = {
      roomId: 'comp-456_male_u12_individual',
      playerId: 'player-789',
      judgeType: 'technical',
      score: 8.5
    };

    it('should broadcast score update for authorized judge', async () => {
      mockAuthorizationService.canJudgeScore.mockResolvedValue(true);
      const mockToEmit = jest.fn();
      mockSocket.to.mockReturnValue({ emit: mockToEmit });

      await scoringHandler.handleScoreUpdate(mockSocket, scoreData);

      expect(mockAuthorizationService.canJudgeScore).toHaveBeenCalledWith(
        'judge-123',
        'comp-456'
      );
      expect(mockSocket.to).toHaveBeenCalledWith(scoreData.roomId);
      expect(mockToEmit).toHaveBeenCalledWith(
        EventTypes.SCORE_UPDATED,
        expect.objectContaining({
          playerId: 'player-789',
          judgeType: 'technical',
          score: 8.5,
          judgeId: 'judge-123'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Score update broadcasted',
        expect.any(Object)
      );
    });

    it('should reject score update from non-judge', async () => {
      mockSocket.userType = 'player';

      await expect(
        scoringHandler.handleScoreUpdate(mockSocket, scoreData)
      ).rejects.toThrow('Only judges can update scores');
    });

    it('should reject score update with missing fields', async () => {
      await expect(
        scoringHandler.handleScoreUpdate(mockSocket, {
          roomId: 'comp-456_male_u12_individual'
        })
      ).rejects.toThrow('Missing required fields');
    });

    it('should reject unauthorized judge', async () => {
      mockAuthorizationService.canJudgeScore.mockResolvedValue(false);

      await expect(
        scoringHandler.handleScoreUpdate(mockSocket, scoreData)
      ).rejects.toThrow('Not authorized to score in this competition');
    });
  });

  describe('handleScoresSaved', () => {
    const scoresData = {
      roomId: 'comp-456_male_u12_individual',
      playerId: 'player-789',
      scores: {
        technical: 8.5,
        artistic: 9.0
      }
    };

    it('should broadcast scores saved for authorized judge', async () => {
      mockAuthorizationService.canJudgeScore.mockResolvedValue(true);

      await scoringHandler.handleScoresSaved(mockSocket, scoresData);

      expect(mockAuthorizationService.canJudgeScore).toHaveBeenCalledWith(
        'judge-123',
        'comp-456'
      );
      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        scoresData.roomId,
        EventTypes.SCORES_SAVED_NOTIFICATION,
        expect.objectContaining({
          playerId: 'player-789',
          scores: scoresData.scores,
          savedBy: 'judge-123',
          savedByType: 'judge'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scores saved notification broadcasted',
        expect.any(Object)
      );
    });

    it('should allow admin to save scores without permission check', async () => {
      mockSocket.userType = 'admin';

      await scoringHandler.handleScoresSaved(mockSocket, scoresData);

      expect(mockAuthorizationService.canJudgeScore).not.toHaveBeenCalled();
      expect(mockSocketManager.emitToRoom).toHaveBeenCalled();
    });

    it('should allow superadmin to save scores without permission check', async () => {
      mockSocket.userType = 'superadmin';

      await scoringHandler.handleScoresSaved(mockSocket, scoresData);

      expect(mockAuthorizationService.canJudgeScore).not.toHaveBeenCalled();
      expect(mockSocketManager.emitToRoom).toHaveBeenCalled();
    });

    it('should reject scores saved from unauthorized user type', async () => {
      mockSocket.userType = 'player';

      await expect(
        scoringHandler.handleScoresSaved(mockSocket, scoresData)
      ).rejects.toThrow('Not authorized to save scores');
    });

    it('should reject scores saved with missing fields', async () => {
      await expect(
        scoringHandler.handleScoresSaved(mockSocket, {
          roomId: 'comp-456_male_u12_individual'
        })
      ).rejects.toThrow('Missing required fields');
    });

    it('should reject unauthorized judge from saving scores', async () => {
      mockAuthorizationService.canJudgeScore.mockResolvedValue(false);

      await expect(
        scoringHandler.handleScoresSaved(mockSocket, scoresData)
      ).rejects.toThrow('Not authorized to save scores in this competition');
    });
  });
});
