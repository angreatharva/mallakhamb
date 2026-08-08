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

    // HIGH-5: room access was gated on ROLE alone, so any authenticated judge
    // could join any scoring room — including one for a competition, gender or
    // age group they are not assigned to. Admins and superadmins legitimately
    // observe every room and have no per-category assignment, so they keep
    // blanket access; judges are held to their actual assignments.
    const validator = async (socket, roomId) => {
      if (['admin', 'superadmin'].includes(socket.userType)) {
        return true;
      }
      if (socket.userType !== 'judge') {
        return false;
      }
      if (!String(roomId).startsWith('scoring_')) {
        // Non-scoring rooms keep the previous role-based behaviour.
        return true;
      }
      return this.socketManager.isJudgeAuthorizedForRoom(socket, roomId);
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

    const { roomId, playerId, teamId, judgeType, judgeNo, score, notes, breakdown, playerName } = data;

    // Validate required fields
    if (!roomId || !playerId || !judgeType || score === undefined) {
      throw new Error('Missing required fields: roomId, playerId, judgeType, score');
    }

    // Room format is scoring_{gender}_{ageGroup}_{competitionType} — not competitionId.
    const isScoringRoom = String(roomId).startsWith('scoring_');
    if (isScoringRoom) {
      // HIGH-5: this branch previously performed NO authorization at all, so any
      // authenticated judge could broadcast a forged slip into any panel's live
      // review screen. Membership is now checked against the judge's actual
      // assignment, using the same predicate as auto-join.
      const authorized = await this.socketManager.isJudgeAuthorizedForRoom(socket, roomId);
      if (!authorized) {
        throw new Error('Not authorized to score in this category');
      }
    } else {
      const competitionId = roomId.split('_')[0];
      const hasPermission = await this.authorizationService.canJudgeScore(
        socket.userId,
        competitionId
      );
      if (!hasPermission) {
        throw new Error('Not authorized to score in this competition');
      }
    }

    // HIGH-5: stamp the role from the SOCKET identity, not the payload —
    // mirroring what Phase 1.2 did for the HTTP path in admin.controller.js.
    // The one carve-out matches that fix: a genuine Senior Judge may broadcast a
    // correction to another panel member's slip, because JudgePanelReview's
    // SrEditModal is a shipped feature (JudgePanelReview.jsx:180). That power
    // comes from the socket identity; a non-senior sending `overrideBySenior` is
    // still stamped as themselves.
    const assignedJudgeType =
      (socket.judgeTypeByRoom && socket.judgeTypeByRoom.get(roomId)) || socket.judgeType || null;
    const isSeniorJudge = assignedJudgeType === 'Senior Judge';
    const effectiveJudgeType = (isSeniorJudge && data.overrideBySenior && judgeType)
      ? judgeType
      : (assignedJudgeType || judgeType);

    const payload = {
      playerId,
      playerName,
      judgeType: effectiveJudgeType,
      judgeNo: judgeNo || data.judgeNo || null,
      score,
      breakdown,
      teamId: teamId || null,
      judgeId: socket.userId,
      timestamp: new Date().toISOString()
    };

    // Broadcast score update to all users in the room except sender (real-time panel sync).
    // Persistence is handled by POST /public/save-score; socket is for live Panel Review.
    socket.to(roomId).emit(EventTypes.SCORE_UPDATED, payload);

    const altRoomId = this.getAltRoomId(roomId);
    if (altRoomId && altRoomId !== roomId) {
      socket.to(altRoomId).emit(EventTypes.SCORE_UPDATED, payload);
    }

    socket.emit(EventTypes.SCORE_SAVED, {
      playerId,
      teamId: teamId || null,
      score,
      broadcast: true
    });

    this.logger.info('Score update broadcast via Socket.IO', {
      roomId,
      altRoomId,
      playerId,
      teamId,
      judgeId: socket.userId,
      // The role actually broadcast, plus what the client claimed — a
      // divergence between these two is the signature of an impersonation
      // attempt and is worth being able to grep for.
      judgeType: effectiveJudgeType,
      claimedJudgeType: judgeType,
      score,
      hasBreakdown: !!breakdown
    });
  }

  /**
   * Helper to get alternate room ID format (competition_1 <-> Competition I)
   * @param {string} roomId - Room ID
   * @returns {string|null} Alternate room ID
   */
  getAltRoomId(roomId) {
    if (!roomId || typeof roomId !== 'string') return null;
    if (!roomId.startsWith('scoring_')) return null;

    if (roomId.includes('competition_')) {
      return roomId
        .replace('competition_1', 'Competition I')
        .replace('competition_2', 'Competition II')
        .replace('competition_3', 'Competition III')
        .replace('competition_4', 'Competition IV')
        .replace('competition_5', 'Competition V');
    } else if (roomId.includes('Competition ')) {
      return roomId
        .replace('Competition I', 'competition_1')
        .replace('Competition II', 'competition_2')
        .replace('Competition III', 'competition_3')
        .replace('Competition IV', 'competition_4')
        .replace('Competition V', 'competition_5');
    }
    return null;
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

    const payload = {
      playerId,
      scores,
      savedBy: socket.userId,
      savedByType: socket.userType,
      timestamp: new Date().toISOString()
    };

    // Broadcast scores saved notification to all users in the room
    this.socketManager.emitToRoom(roomId, EventTypes.SCORES_SAVED_NOTIFICATION, payload);
    
    const altRoomId = this.getAltRoomId(roomId);
    if (altRoomId && altRoomId !== roomId) {
      this.socketManager.emitToRoom(altRoomId, EventTypes.SCORES_SAVED_NOTIFICATION, payload);
    }

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
