/**
 * Notification Event Handler
 * 
 * Handles Socket.IO events related to notifications and updates.
 * 
 * Requirements: 4.3, 4.4, 4.5
 */

const EventTypes = require('../events/event-types');

class NotificationHandler {
  /**
   * Create a notification handler
   * @param {SocketManager} socketManager - Socket manager instance
   * @param {Logger} logger - Logger instance
   */
  constructor(socketManager, logger) {
    this.socketManager = socketManager;
    this.logger = logger;
  }

  /**
   * Register all notification event handlers
   */
  register() {
    this.logger.info('Notification event handlers registered');
  }

  /**
   * Send notification to specific user
   * @param {string} userId - User ID
   * @param {Object} notification - Notification data
   */
  sendToUser(userId, notification) {
    this.socketManager.emitToUser(userId, EventTypes.NOTIFICATION, {
      ...notification,
      timestamp: new Date().toISOString()
    });

    this.logger.debug('Notification sent to user', {
      userId,
      notification
    });
  }

  /**
   * Send notification to all users in a competition
   * @param {string} competitionId - Competition ID
   * @param {Object} notification - Notification data
   */
  sendToCompetition(competitionId, notification) {
    const roomId = `competition_${competitionId}`;
    
    this.socketManager.emitToRoom(roomId, EventTypes.NOTIFICATION, {
      ...notification,
      timestamp: new Date().toISOString()
    });

    this.logger.debug('Notification sent to competition', {
      competitionId,
      notification
    });
  }

  /**
   * Broadcast competition update
   * @param {string} competitionId - Competition ID
   * @param {Object} update - Update data
   */
  broadcastCompetitionUpdate(competitionId, update) {
    const roomId = `competition_${competitionId}`;
    
    this.socketManager.emitToRoom(roomId, EventTypes.COMPETITION_UPDATE, {
      competitionId,
      ...update,
      timestamp: new Date().toISOString()
    });

    this.logger.info('Competition update broadcasted', {
      competitionId,
      update
    });
  }

  /**
   * Broadcast team update
   * @param {string} teamId - Team ID
   * @param {Object} update - Update data
   */
  broadcastTeamUpdate(teamId, update) {
    const roomId = `team_${teamId}`;
    
    this.socketManager.emitToRoom(roomId, EventTypes.TEAM_UPDATE, {
      teamId,
      ...update,
      timestamp: new Date().toISOString()
    });

    this.logger.info('Team update broadcasted', {
      teamId,
      update
    });
  }

  /**
   * Broadcast player update
   * @param {string} playerId - Player ID
   * @param {Object} update - Update data
   */
  broadcastPlayerUpdate(playerId, update) {
    this.socketManager.emitToUser(playerId, EventTypes.PLAYER_UPDATE, {
      playerId,
      ...update,
      timestamp: new Date().toISOString()
    });

    this.logger.info('Player update sent', {
      playerId,
      update
    });
  }
}

module.exports = NotificationHandler;
