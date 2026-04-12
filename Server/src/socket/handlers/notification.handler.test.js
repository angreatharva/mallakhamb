/**
 * Notification Handler Unit Tests
 * 
 * Tests notification event handler functionality
 * 
 * Requirements: 15.1, 15.8
 */

const NotificationHandler = require('./notification.handler');
const EventTypes = require('../events/event-types');

describe('NotificationHandler', () => {
  let notificationHandler;
  let mockSocketManager;
  let mockLogger;

  beforeEach(() => {
    // Mock socket manager
    mockSocketManager = {
      registerEventHandler: jest.fn(),
      emitToUser: jest.fn(),
      emitToRoom: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    notificationHandler = new NotificationHandler(
      mockSocketManager,
      mockLogger
    );
  });

  describe('register', () => {
    it('should register notification event handlers', () => {
      notificationHandler.register();

      expect(mockLogger.info).toHaveBeenCalledWith('Notification event handlers registered');
    });
  });

  describe('sendToUser', () => {
    it('should send notification to specific user', () => {
      const notification = {
        type: 'info',
        message: 'Your score has been updated'
      };

      notificationHandler.sendToUser('user-123', notification);

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'user-123',
        EventTypes.NOTIFICATION,
        expect.objectContaining({
          type: 'info',
          message: 'Your score has been updated',
          timestamp: expect.any(String)
        })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Notification sent to user',
        expect.objectContaining({
          userId: 'user-123',
          notification
        })
      );
    });
  });

  describe('sendToCompetition', () => {
    it('should send notification to all users in competition', () => {
      const notification = {
        type: 'warning',
        message: 'Competition starting in 10 minutes'
      };

      notificationHandler.sendToCompetition('comp-456', notification);

      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        'competition_comp-456',
        EventTypes.NOTIFICATION,
        expect.objectContaining({
          type: 'warning',
          message: 'Competition starting in 10 minutes',
          timestamp: expect.any(String)
        })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Notification sent to competition',
        expect.objectContaining({
          competitionId: 'comp-456',
          notification
        })
      );
    });
  });

  describe('broadcastCompetitionUpdate', () => {
    it('should broadcast competition update', () => {
      const update = {
        status: 'in_progress',
        currentRound: 2
      };

      notificationHandler.broadcastCompetitionUpdate('comp-456', update);

      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        'competition_comp-456',
        EventTypes.COMPETITION_UPDATE,
        expect.objectContaining({
          competitionId: 'comp-456',
          status: 'in_progress',
          currentRound: 2,
          timestamp: expect.any(String)
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Competition update broadcasted',
        expect.objectContaining({
          competitionId: 'comp-456',
          update
        })
      );
    });
  });

  describe('broadcastTeamUpdate', () => {
    it('should broadcast team update', () => {
      const update = {
        action: 'player_added',
        playerId: 'player-789'
      };

      notificationHandler.broadcastTeamUpdate('team-123', update);

      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        'team_team-123',
        EventTypes.TEAM_UPDATE,
        expect.objectContaining({
          teamId: 'team-123',
          action: 'player_added',
          playerId: 'player-789',
          timestamp: expect.any(String)
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Team update broadcasted',
        expect.objectContaining({
          teamId: 'team-123',
          update
        })
      );
    });
  });

  describe('broadcastPlayerUpdate', () => {
    it('should send player update to specific player', () => {
      const update = {
        action: 'team_assigned',
        teamId: 'team-123'
      };

      notificationHandler.broadcastPlayerUpdate('player-789', update);

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'player-789',
        EventTypes.PLAYER_UPDATE,
        expect.objectContaining({
          playerId: 'player-789',
          action: 'team_assigned',
          teamId: 'team-123',
          timestamp: expect.any(String)
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Player update sent',
        expect.objectContaining({
          playerId: 'player-789',
          update
        })
      );
    });
  });
});
