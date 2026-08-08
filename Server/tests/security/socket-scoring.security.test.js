/**
 * Security verification for HIGH-5 — socket score updates skipped authorization
 * inside scoring rooms.
 *
 * Before the fix, `scoring.handler.js` ran `canJudgeScore()` ONLY for
 * non-scoring rooms; room membership itself was gated on role alone. Any
 * authenticated judge could therefore join `scoring_Male_Under14_competition_1`
 * — including one assigned to a different competition, gender or age group —
 * and broadcast `score_updated` with an arbitrary `judgeType`, `playerId` and
 * `score`, which every Panel Review screen in that room would render. Nothing
 * was persisted, so it vanished on refresh: a confusing, hard-to-diagnose
 * disruption rather than an obvious attack.
 *
 * STATUS: FIXED. These are plain regression guards.
 *
 * The manager and handler are exercised directly with stub collaborators —
 * there is no Socket.IO server here, because the defect and the fix both live
 * in the authorization predicate, not in the transport.
 */

const SocketManager = require('../../src/socket/socket.manager');
const ScoringHandler = require('../../src/socket/handlers/scoring.handler');
const EventTypes = require('../../src/socket/events/event-types');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** A judge assigned to Male / Under14 / competition_1 only. */
const JUDGE_ONE = {
  _id: 'judge-1',
  name: 'Judge One',
  username: 'judge1',
  judgeType: 'Judge 1',
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
};

const SENIOR_JUDGE = {
  _id: 'judge-sr',
  name: 'Senior Judge One',
  username: 'srjudge1',
  judgeType: 'Senior Judge',
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
};

function buildManager(judgeDetailsById) {
  const authorizationService = {
    getJudgeDetails: async (userId) => judgeDetailsById[userId] || null,
    canJudgeScore: async () => true,
  };

  return new SocketManager(
    null,
    { verifyToken: () => ({}) },
    authorizationService,
    { get: () => 'test' },
    noopLogger,
    null
  );
}

/** Minimal socket double capturing joins and emissions. */
function makeSocket(userId, userType = 'judge') {
  const emitted = [];
  const broadcasts = [];
  return {
    id: `socket-${userId}`,
    userId,
    userType,
    joined: [],
    join(room) { this.joined.push(room); },
    emit(event, payload) { emitted.push({ event, payload }); },
    to(room) {
      return {
        emit: (event, payload) => broadcasts.push({ room, event, payload }),
      };
    },
    emitted,
    broadcasts,
  };
}

describe('HIGH-5 — socket scoring-room authorization (FIXED)', () => {
  let manager;

  beforeEach(() => {
    manager = buildManager({ 'judge-1': JUDGE_ONE, 'judge-sr': SENIOR_JUDGE });
  });

  test('an assignment entitles the judge to BOTH room-id forms', () => {
    const rooms = manager.getRoomIdsForAssignment(JUDGE_ONE);

    // The codebase addresses the same room in slug and display form; an
    // authorization check handling only one would reject legitimate judges.
    expect(rooms).toContain('scoring_Male_Under14_competition_1');
    expect(rooms).toContain('scoring_Male_Under14_Competition I');
  });

  test('a judge is authorized in their own category, in either form', async () => {
    const socket = makeSocket('judge-1');

    await expect(
      manager.isJudgeAuthorizedForRoom(socket, 'scoring_Male_Under14_competition_1')
    ).resolves.toBe(true);
    await expect(
      manager.isJudgeAuthorizedForRoom(socket, 'scoring_Male_Under14_Competition I')
    ).resolves.toBe(true);
  });

  test('a judge is NOT authorized in another gender, age group or category', async () => {
    const socket = makeSocket('judge-1');

    await expect(
      manager.isJudgeAuthorizedForRoom(socket, 'scoring_Female_Under14_competition_1')
    ).resolves.toBe(false);
    await expect(
      manager.isJudgeAuthorizedForRoom(socket, 'scoring_Male_Under18_competition_1')
    ).resolves.toBe(false);
    await expect(
      manager.isJudgeAuthorizedForRoom(socket, 'scoring_Male_Under14_competition_2')
    ).resolves.toBe(false);
  });

  test('auto-join only joins rooms the judge is then authorized for', async () => {
    const socket = makeSocket('judge-1');
    await manager.autoJoinJudgeRoom(socket);

    expect(socket.joined.length).toBeGreaterThan(0);
    for (const room of socket.joined) {
      await expect(manager.isJudgeAuthorizedForRoom(socket, room)).resolves.toBe(true);
    }
  });
});

describe('HIGH-5 — score_update broadcasts (FIXED)', () => {
  let manager;
  let handler;

  beforeEach(() => {
    manager = buildManager({ 'judge-1': JUDGE_ONE, 'judge-sr': SENIOR_JUDGE });
    // registerEventHandler is only used at wiring time; stub it out.
    manager.registerEventHandler = () => {};
    handler = new ScoringHandler(manager, null, manager.authorizationService, noopLogger);
  });

  const baseUpdate = {
    roomId: 'scoring_Male_Under14_competition_1',
    playerId: 'player-1',
    teamId: 'team-1',
    score: 8.5,
  };

  test('rejects a judge broadcasting into a category they are not assigned to', async () => {
    const socket = makeSocket('judge-1');

    await expect(
      handler.handleScoreUpdate(socket, {
        ...baseUpdate,
        roomId: 'scoring_Female_Under14_competition_1',
        judgeType: 'Judge 1',
      })
    ).rejects.toThrow(/Not authorized/);

    expect(socket.broadcasts).toHaveLength(0);
  });

  test('stamps judgeType from the socket identity, not the payload', async () => {
    const socket = makeSocket('judge-1');

    // The impersonation attempt: Judge 1 claims to be the Senior Judge.
    await handler.handleScoreUpdate(socket, {
      ...baseUpdate,
      judgeType: 'Senior Judge',
    });

    const scoreUpdates = socket.broadcasts.filter((b) => b.event === EventTypes.SCORE_UPDATED);
    expect(scoreUpdates.length).toBeGreaterThan(0);
    for (const { payload } of scoreUpdates) {
      expect(payload.judgeType).toBe('Judge 1');
    }
  });

  test('a non-senior judge cannot override another slip via overrideBySenior', async () => {
    const socket = makeSocket('judge-1');

    await handler.handleScoreUpdate(socket, {
      ...baseUpdate,
      judgeType: 'Judge 3',
      overrideBySenior: true,
    });

    const scoreUpdates = socket.broadcasts.filter((b) => b.event === EventTypes.SCORE_UPDATED);
    expect(scoreUpdates.length).toBeGreaterThan(0);
    for (const { payload } of scoreUpdates) {
      expect(payload.judgeType).toBe('Judge 1');
    }
  });

  test('a genuine Senior Judge may broadcast a correction for another judge', async () => {
    // Preserves the shipped SrEditModal feature (JudgePanelReview.jsx:180).
    const socket = makeSocket('judge-sr');

    await handler.handleScoreUpdate(socket, {
      ...baseUpdate,
      judgeType: 'Judge 2',
      overrideBySenior: true,
    });

    const scoreUpdates = socket.broadcasts.filter((b) => b.event === EventTypes.SCORE_UPDATED);
    expect(scoreUpdates.length).toBeGreaterThan(0);
    for (const { payload } of scoreUpdates) {
      expect(payload.judgeType).toBe('Judge 2');
    }
  });

  test('a non-judge cannot broadcast score updates at all', async () => {
    const socket = makeSocket('admin-1', 'admin');

    await expect(
      handler.handleScoreUpdate(socket, { ...baseUpdate, judgeType: 'Judge 1' })
    ).rejects.toThrow(/Only judges can update scores/);
  });
});
