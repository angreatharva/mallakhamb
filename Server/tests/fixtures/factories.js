/**
 * Test Data Factories
 *
 * Provides factory functions for creating consistent test data objects
 * for players, coaches, admins, competitions, teams, and scores.
 *
 * Requirements: 15.4
 */

const mongoose = require('mongoose');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a fresh MongoDB ObjectId string */
const newId = () => new mongoose.Types.ObjectId().toString();

/** Merge overrides into a base object (shallow) */
const merge = (base, overrides = {}) => ({ ...base, ...overrides });

/** Sequence counter for unique values */
const counters = {};
const seq = (key) => {
  counters[key] = (counters[key] || 0) + 1;
  return counters[key];
};

/** Reset all sequence counters (call in beforeEach if needed) */
const resetSequences = () => {
  Object.keys(counters).forEach((k) => delete counters[k]);
};

// ─── Player Factory ──────────────────────────────────────────────────────────

/**
 * Build a plain player data object (no DB interaction).
 *
 * @param {object} overrides - Fields to override
 * @returns {object} Player data
 */
const buildPlayer = (overrides = {}) => {
  const n = seq('player');
  return merge(
    {
      _id: newId(),
      firstName: `Player${n}`,
      lastName: `Test${n}`,
      email: `player${n}@test.com`,
      password: 'Password1!',
      dateOfBirth: new Date('2005-01-01'),
      gender: 'Male',
      ageGroup: 'Under18',
      team: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build multiple player objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildPlayers = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildPlayer(overrides));

// ─── Coach Factory ───────────────────────────────────────────────────────────

/**
 * Build a plain coach data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildCoach = (overrides = {}) => {
  const n = seq('coach');
  return merge(
    {
      _id: newId(),
      name: `Coach${n}`,
      email: `coach${n}@test.com`,
      password: 'Password1!',
      team: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build multiple coach objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildCoaches = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildCoach(overrides));

// ─── Admin Factory ───────────────────────────────────────────────────────────

/**
 * Build a plain admin data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildAdmin = (overrides = {}) => {
  const n = seq('admin');
  return merge(
    {
      _id: newId(),
      name: `Admin${n}`,
      email: `admin${n}@test.com`,
      password: 'Password1!',
      role: 'admin',
      isActive: true,
      competitions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build a super admin data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildSuperAdmin = (overrides = {}) =>
  buildAdmin({ role: 'super_admin', ...overrides });

/**
 * Build multiple admin objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildAdmins = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildAdmin(overrides));

// ─── Competition Factory ─────────────────────────────────────────────────────

/**
 * Build a plain competition data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildCompetition = (overrides = {}) => {
  const n = seq('competition');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 30); // 30 days from now
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 3);

  return merge(
    {
      _id: newId(),
      name: `Competition ${n}`,
      level: 'state',
      competitionTypes: ['competition_1'],
      place: `City ${n}`,
      year: new Date().getFullYear(),
      startDate,
      endDate,
      description: `Test competition ${n}`,
      status: 'upcoming',
      admins: [],
      registeredTeams: [],
      ageGroups: [],
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build an ongoing competition.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildOngoingCompetition = (overrides = {}) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 2);
  return buildCompetition({ status: 'ongoing', startDate, endDate, ...overrides });
};

/**
 * Build a completed competition.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildCompletedCompetition = (overrides = {}) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 10);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  return buildCompetition({ status: 'completed', startDate, endDate, ...overrides });
};

/**
 * Build multiple competition objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildCompetitions = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildCompetition(overrides));

// ─── Team Factory ────────────────────────────────────────────────────────────

/**
 * Build a plain team data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildTeam = (overrides = {}) => {
  const n = seq('team');
  const coachId = newId();
  return merge(
    {
      _id: newId(),
      name: `Team ${n}`,
      coach: coachId,
      description: `Test team ${n}`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build multiple team objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildTeams = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildTeam(overrides));

// ─── Score Factory ───────────────────────────────────────────────────────────

/**
 * Build a player score entry (embedded in a Score document).
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildPlayerScore = (overrides = {}) => {
  const playerId = newId();
  return merge(
    {
      playerId,
      playerName: `Player Test`,
      time: '1:30',
      judgeScores: {
        seniorJudge: 7.5,
        judge1: 7.0,
        judge2: 7.5,
        judge3: 8.0,
        judge4: 7.5,
      },
      executionAverage: 7.5,
      baseScore: 0,
      baseScoreApplied: false,
      toleranceUsed: 0,
      averageMarks: 7.5,
      deductions: 0,
      finalScore: 7.5,
    },
    overrides
  );
};

/**
 * Build a plain score document data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildScore = (overrides = {}) => {
  const n = seq('score');
  const competitionId = newId();
  const judgeId = newId();
  const teamId = newId();

  return merge(
    {
      _id: newId(),
      competition: competitionId,
      judge: judgeId,
      team: teamId,
      gender: 'Male',
      ageGroup: 'Under18',
      competitionType: 'competition_1',
      playerScores: [buildPlayerScore()],
      isLocked: false,
      timeKeeper: `TimeKeeper${n}`,
      scorer: `Scorer${n}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

/**
 * Build multiple score objects.
 *
 * @param {number} count
 * @param {object} overrides
 * @returns {object[]}
 */
const buildScores = (count, overrides = {}) =>
  Array.from({ length: count }, () => buildScore(overrides));

// ─── Judge Factory ───────────────────────────────────────────────────────────

/**
 * Build a plain judge data object.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildJudge = (overrides = {}) => {
  const n = seq('judge');
  return merge(
    {
      _id: newId(),
      username: `judge${n}`,
      password: 'Password1!',
      name: `Judge ${n}`,
      email: `judge${n}@test.com`,
      competition: newId(),
      ageGroup: 'Under18',
      gender: 'Male',
      competitionType: 'competition_1',
      role: 'judge',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    overrides
  );
};

// ─── Auth Token Factory ──────────────────────────────────────────────────────

/**
 * Build a decoded JWT payload for a user.
 *
 * @param {object} overrides
 * @returns {object}
 */
const buildTokenPayload = (overrides = {}) =>
  merge(
    {
      userId: newId(),
      userType: 'player',
      competitionId: null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    },
    overrides
  );

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Helpers
  newId,
  resetSequences,

  // Player
  buildPlayer,
  buildPlayers,

  // Coach
  buildCoach,
  buildCoaches,

  // Admin
  buildAdmin,
  buildSuperAdmin,
  buildAdmins,

  // Competition
  buildCompetition,
  buildOngoingCompetition,
  buildCompletedCompetition,
  buildCompetitions,

  // Team
  buildTeam,
  buildTeams,

  // Score
  buildPlayerScore,
  buildScore,
  buildScores,

  // Judge
  buildJudge,

  // Auth
  buildTokenPayload,
};
