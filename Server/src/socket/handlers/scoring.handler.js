/**
 * Scoring Event Handler
 * 
 * Handles Socket.IO events related to scoring operations.
 * Validates permissions and delegates to ScoringService.
 * 
 * Requirements: 4.3, 4.4, 4.5
 */

const EventTypes = require('../events/event-types');

class ScoringHandler {
  /**
   * Create a scoring handler
   * @param {SocketManager} socketManager - Socket manager instance
   * @param {ScoringService} scoringService - Scoring service
   * @param {AuthorizationService} authorizationService - Authorization service
   * @param {Logger} logger - Logger instance
   */
  constructor(socketManager, scoringService, authorizationService, logger, judgeService = null) {
    this.socketManager = socketManager;
    this.scoringService = scoringService;
    this.authorizationService = authorizationService;
    this.logger = logger;
    this.judgeService = judgeService;
  }

  /**
   * Register all scoring event handlers
   */
  register() {
    // Register join scoring room handler
    this.socketManager.registerEventHandler(
      EventTypes.JOIN_SCORING_ROOM,
      this.handleJoinScoringRoom.bind(this)
    );

    // Register leave scoring room handler
    this.socketManager.registerEventHandler(
      EventTypes.LEAVE_SCORING_ROOM,
      this.handleLeaveScoringRoom.bind(this)
    );

    // Register score update handler
    this.socketManager.registerEventHandler(
      EventTypes.SCORE_UPDATE,
      this.handleScoreUpdate.bind(this)
    );

    // Register score update request handler (for updating existing scores)
    this.socketManager.registerEventHandler(
      EventTypes.SCORE_UPDATE_REQUEST,
      this.handleScoreUpdateRequest.bind(this)
    );

    // Register scores saved handler
    this.socketManager.registerEventHandler(
      EventTypes.SCORES_SAVED,
      this.handleScoresSaved.bind(this)
    );

    this.logger.info('Scoring event handlers registered');
  }

  /**
   * Handle join scoring room event
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Event data { roomId }
   */
  async handleJoinScoringRoom(socket, data) {
    const { roomId } = data;

    if (!roomId) {
      throw new Error('Room ID required');
    }

    // Validate room access
    const validator = async (socket, roomId) => {
      return ['judge', 'admin', 'superadmin'].includes(socket.userType);
    };

    // Join the room with validation
    const joined = await this.socketManager.joinRoom(socket, roomId, validator);

    if (joined) {
      // Notify client
      socket.emit(EventTypes.ROOM_JOINED, {
        roomId,
        message: 'Successfully joined scoring room'
      });
    }
  }

  /**
   * Handle leave scoring room event
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Event data { roomId }
   */
  async handleLeaveScoringRoom(socket, data) {
    const { roomId } = data;

    if (!roomId) {
      throw new Error('Room ID required');
    }

    this.socketManager.leaveRoom(socket, roomId);

    // Notify client
    socket.emit(EventTypes.ROOM_LEFT, {
      roomId,
      message: 'Successfully left scoring room'
    });
  }

  /**
   * Handle score update event
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Event data { roomId, playerId, judgeType, score, ... }
   */
  async handleScoreUpdate(socket, data) {
    // Validate user is a judge
    if (socket.userType !== 'judge') {
      throw new Error('Only judges can update scores');
    }

    const { roomId, playerId, teamId, judgeType, score, notes } = data;

    // Validate required fields
    if (!roomId || !playerId || !judgeType || score === undefined) {
      throw new Error('Missing required fields: roomId, playerId, judgeType, score');
    }

    // Extract competition ID from room ID
    const competitionId = roomId.split('_')[0];

    // Validate judge has permission to score in this competition
    const hasPermission = await this.authorizationService.canJudgeScore(
      socket.userId,
      competitionId
    );

    if (!hasPermission) {
      throw new Error('Not authorized to score in this competition');
    }

    // If teamId is provided, save the score via JudgeService
    if (teamId) {
      try {
        if (!this.judgeService) {
          throw new Error('Judge service is not configured');
        }

        const savedScore = await this.judgeService.saveIndividualScore(socket.userId, {
          playerId,
          teamId,
          competitionId,
          score,
          notes
        });

        // Emit confirmation to judge
        socket.emit(EventTypes.SCORE_SAVED, {
          scoreId: savedScore._id,
          playerId,
          teamId,
          score: savedScore.score
        });

        this.logger.info('Score saved via Socket.IO', {
          roomId,
          playerId,
          teamId,
          judgeId: socket.userId,
          score
        });

        return; // Score saved, event already broadcasted by service
      } catch (error) {
        this.logger.error('Socket.IO score save error', {
          roomId,
          playerId,
          error: error.message
        });
        socket.emit(EventTypes.SCORE_ERROR, {
          message: error.message
        });
        return;
      }
    }

    // Broadcast score update to all users in the room except sender (real-time preview)
    socket.to(roomId).emit(EventTypes.SCORE_UPDATED, {
      playerId,
      judgeType,
      score,
      judgeId: socket.userId,
      timestamp: new Date().toISOString()
    });

    this.logger.info('Score update broadcasted', {
      roomId,
      playerId,
      judgeType,
      score,
      judgeId: socket.userId
    });
  }

  /**
   * Handle scores saved event
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Event data { roomId, playerId, scores }
   */
  async handleScoresSaved(socket, data) {
    // Validate user is a judge, admin, or superadmin
    if (!['judge', 'admin', 'superadmin'].includes(socket.userType)) {
      throw new Error('Not authorized to save scores');
    }

    const { roomId, playerId, scores } = data;

    // Validate required fields
    if (!roomId || !playerId || !scores) {
      throw new Error('Missing required fields: roomId, playerId, scores');
    }

    // Extract competition ID from room ID
    const competitionId = roomId.split('_')[0];

    // Validate user has permission
    if (socket.userType === 'judge') {
      const hasPermission = await this.authorizationService.canJudgeScore(
        socket.userId,
        competitionId
      );

      if (!hasPermission) {
        throw new Error('Not authorized to save scores in this competition');
      }
    }

    // Broadcast scores saved notification to all users in the room
    this.socketManager.emitToRoom(roomId, EventTypes.SCORES_SAVED_NOTIFICATION, {
      playerId,
      scores,
      savedBy: socket.userId,
      savedByType: socket.userType,
      timestamp: new Date().toISOString()
    });

    this.logger.info('Scores saved notification broadcasted', {
      roomId,
      playerId,
      savedBy: socket.userId,
      savedByType: socket.userType
    });
  }

  /**
   * Handle score update request (for updating existing scores)
   * @param {Socket} socket - Socket.IO socket instance
   * @param {Object} data - Event data { scoreId, updates }
   */
  async handleScoreUpdateRequest(socket, data) {
    // Validate user is a judge
    if (socket.userType !== 'judge') {
      throw new Error('Only judges can update scores');
    }

    const { scoreId, updates } = data;

    // Validate required fields
    if (!scoreId || !updates) {
      throw new Error('Missing required fields: scoreId, updates');
    }

    try {
      if (!this.judgeService) {
        throw new Error('Judge service is not configured');
      }

      const updatedScore = await this.judgeService.updateIndividualScore(
        socket.userId,
        scoreId,
        updates
      );

      // Emit confirmation to judge
      socket.emit(EventTypes.SCORE_UPDATE_SUCCESS, {
        scoreId,
        score: updatedScore
      });

      this.logger.info('Score updated via Socket.IO', {
        scoreId,
        judgeId: socket.userId
      });
    } catch (error) {
      this.logger.error('Socket.IO score update error', {
        scoreId,
        error: error.message
      });
      socket.emit(EventTypes.SCORE_ERROR, {
        message: error.message
      });
    }
  }
}

module.exports = ScoringHandler;
