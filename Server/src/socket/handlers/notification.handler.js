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
    this.socketManager.registerEventHandler(
      EventTypes.JOIN_COMPETITION_ROOM,
      this.handleJoinCompetitionRoom.bind(this)
    );
    this.socketManager.registerEventHandler(
      EventTypes.LEAVE_COMPETITION_ROOM,
      this.handleLeaveCompetitionRoom.bind(this)
    );

    this.logger.info('Notification event handlers registered');
  }

  /**
   * Join `competition_{competitionId}`.
   *
   * A socket already auto-joins its own competition at connect (from the
   * JWT claim — see socket.manager.js:handleConnection), so this is for the
   * case that isn't covered by that: no competition selected yet at
   * handshake, or a competition switch mid-session (`/auth/set-competition`
   * mints a new token, but the existing socket connection keeps the old
   * claim until it reconnects).
   *
   * Admins/superadmins may join any competition's room (they can legitimately
   * be scoped to more than one, or none yet). Coach/player/judge sockets may
   * only join the room matching their OWN authenticated competition context
   * — `socket.competitionId`, the same trusted claim the auto-join above
   * uses — so this cannot be used to eavesdrop on a different meet.
   *
   * @param {Socket} socket
   * @param {{competitionId: string}} data
   */
  async handleJoinCompetitionRoom(socket, data) {
    const { competitionId } = data || {};

    if (!competitionId) {
      throw new Error('competitionId required');
    }

    const roomId = `competition_${competitionId}`;

    const validator = async (sock) => {
      if (['admin', 'superadmin'].includes(sock.userType)) {
        return true;
      }
      return sock.competitionId != null && String(sock.competitionId) === String(competitionId);
    };

    const joined = await this.socketManager.joinRoom(socket, roomId, validator);

    if (joined) {
      socket.emit(EventTypes.ROOM_JOINED, {
        roomId,
        message: 'Joined competition room',
      });
    }
  }

  /**
   * Leave `competition_{competitionId}`.
   * @param {Socket} socket
   * @param {{competitionId: string}} data
   */
  async handleLeaveCompetitionRoom(socket, data) {
    const { competitionId } = data || {};

    if (!competitionId) {
      throw new Error('competitionId required');
    }

    const roomId = `competition_${competitionId}`;
    this.socketManager.leaveRoom(socket, roomId);

    socket.emit(EventTypes.ROOM_LEFT, {
      roomId,
      message: 'Left competition room',
    });
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
