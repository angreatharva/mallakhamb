/**
 * Scoring Event Handler
 * 
 * Handles Socket.IO events related to scoring operations.
 * Validates permissions and delegates to ScoringService.
 * 
 * Requirements: 4.3, 4.4, 4.5
 */

const EventTypes = require('../events/event-types');
const { alternateRoomId } = require('../../utils/data/scoring-room.util');
const {
  isCompetitionLocked,
  mayBypassCompetitionLock,
  lockedMessage,
  lockInstant,
} = require('../../utils/security/competition-lock.util');

class ScoringHandler {
  /**
   * Create a scoring handler
   * @param {SocketManager} socketManager - Socket manager instance
   * @param {ScoringService} scoringService - Scoring service
   * @param {AuthorizationService} authorizationService - Authorization service
   * @param {Logger} logger - Logger instance
   * @param {JudgeService} [judgeService]
   * @param {CompetitionRepository} [competitionRepository] - for the end-date lock
   */
  constructor(
    socketManager,
    scoringService,
    authorizationService,
    logger,
    judgeService = null,
    competitionRepository = null
  ) {
    this.socketManager = socketManager;
    this.scoringService = scoringService;
    this.authorizationService = authorizationService;
    this.logger = logger;
    this.judgeService = judgeService;
    this.competitionRepository = competitionRepository;
  }

  /**
   * Refuse a live broadcast into a meet that has closed.
   *
   * The socket path does not persist anything — `handleScoreUpdate` says so,
   * and POST /public/save-score is where slips are actually written — so this
   * is not the lock's load-bearing half. It is here because a panel screen that
   * keeps accepting and relaying marks into a frozen competition tells four
   * judges their work is being recorded when the HTTP save behind it is
   * answering 423. Better to refuse in the place the judge is looking.
   *
   * The meet comes from `socket.competitionId`, stamped from the JWT at
   * handshake (`socket.manager.js`), NOT from the room id: rooms are
   * `scoring_{gender}_{ageGroup}_{competitionType}` and name no competition at
   * all.
   *
   * Fails OPEN when the competition cannot be determined or read — an
   * unresolvable meet must not silently kill a live panel, and the write this
   * broadcast accompanies is refused by the HTTP guard regardless.
   *
   * @param {Socket} socket
   * @throws {Error} when the competition has locked
   */
  async assertCompetitionUnlocked(socket) {
    // Same wiring check the HTTP guard makes: a harness that hands this class a
    // stub repository leaves the lock inert here rather than throwing into
    // every live broadcast.
    if (typeof this.competitionRepository?.findById !== 'function') return;
    if (mayBypassCompetitionLock(null, socket.userType)) return;

    const competitionId = socket.competitionId;
    if (!competitionId) return;

    let competition;
    try {
      competition = await this.competitionRepository.findById(competitionId, {
        select: 'name endDate',
      });
    } catch (error) {
      this.logger.warn('Competition lock: could not read competition for socket write', {
        competitionId: String(competitionId),
        error: error.message,
      });
      return;
    }

    if (!competition || !isCompetitionLocked(competition)) return;

    this.logger.warn('Competition lock: socket write refused, competition has closed', {
      competitionId: String(competitionId),
      competitionName: competition.name,
      lockedSince: lockInstant(competition)?.toISOString(),
      userId: socket.userId,
      userType: socket.userType,
    });

    throw new Error(lockedMessage(competition, lockInstant(competition)));
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

    /*
     * `score_update_request` is gone. It called
     * `judgeService.updateIndividualScore`, which revised a flat score document
     * the Score schema has no paths for — so it could only ever have thrown.
     * The retired HTTP twins are documented in judge.routes.js. Live slip
     * revision goes through POST /api/judge/scores/save like every other write.
     */

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

    await this.assertCompetitionUnlocked(socket);

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
      /*
       * WHICH PERFORMANCE THIS MARK IS FOR.
       *
       * A score's identity is (player, apparatus) — somebody entered for three
       * apparatus performs three times and earns three separate scores — and
       * the client has always sent this. It was dropped here, so every listener
       * saw `undefined` and `apparatusKey` resolved it to Pole: a Rope slip
       * landed on the athlete's Pole row in the scorer's live sheet.
       *
       * The room is `scoring_{gender}_{ageGroup}_{competitionType}` with no
       * apparatus in it, and now that a category holds one panel PER apparatus
       * that room carries all of them — so this field is the only thing telling
       * the Pole panel's live review that a mark belongs to Rope.
       */
      apparatus: data.apparatus || null,
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
   * The alternate room-id form (competition_1 <-> Competition I).
   *
   * Delegates to `utils/data/scoring-room.util`. The chain that used to live
   * here replaced `Competition I` before `Competition III`, so a Competition III
   * room came back as `..._competition_1II` — a room with no members — and the
   * broadcast to it went nowhere silently. The shared helper tests the display
   * values longest-first.
   *
   * @param {string} roomId - Room ID
   * @returns {string|null} Alternate room ID
   */
  getAltRoomId(roomId) {
    return alternateRoomId(roomId);
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

    await this.assertCompetitionUnlocked(socket);

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

}

module.exports = ScoringHandler;
