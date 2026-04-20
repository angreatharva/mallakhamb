/**
 * Mock Repository Implementations
 *
 * Provides Jest mock factories for all domain repositories.
 * Each factory returns a fresh mock object with all standard
 * BaseRepository methods plus domain-specific methods stubbed out.
 *
 * Requirements: 15.5
 */

// ─── Base Repository Mock ────────────────────────────────────────────────────

/**
 * Create a mock that covers all BaseRepository methods.
 *
 * @returns {object}
 */
const createBaseMock = () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  updateById: jest.fn(),
  deleteById: jest.fn(),
  count: jest.fn(),
  exists: jest.fn(),
  toPlainObject: jest.fn((doc) => doc),
});

// ─── Domain Repository Mocks ─────────────────────────────────────────────────

/**
 * Create a mock PlayerRepository.
 *
 * @returns {object}
 */
const createMockPlayerRepository = () => ({
  ...createBaseMock(),
  findByEmail: jest.fn(),
  findActive: jest.fn(),
  findByTeam: jest.fn(),
  findByAgeGroupAndGender: jest.fn(),
  updateTeam: jest.fn(),
  isEmailTaken: jest.fn(),
  findPaginated: jest.fn(),
});

/**
 * Create a mock CoachRepository.
 *
 * @returns {object}
 */
const createMockCoachRepository = () => ({
  ...createBaseMock(),
  findByEmail: jest.fn(),
  findActive: jest.fn(),
  isEmailTaken: jest.fn(),
  findPaginated: jest.fn(),
});

/**
 * Create a mock AdminRepository.
 *
 * @returns {object}
 */
const createMockAdminRepository = () => ({
  ...createBaseMock(),
  findByEmail: jest.fn(),
  findActive: jest.fn(),
  isEmailTaken: jest.fn(),
  findByRole: jest.fn(),
});

/**
 * Create a mock JudgeRepository.
 *
 * @returns {object}
 */
const createMockJudgeRepository = () => ({
  ...createBaseMock(),
  findByEmail: jest.fn(),
  findActive: jest.fn(),
  findByCompetition: jest.fn(),
});

/**
 * Create a mock CompetitionRepository.
 *
 * @returns {object}
 */
const createMockCompetitionRepository = () => ({
  ...createBaseMock(),
  findActive: jest.fn(),
  findByStatus: jest.fn(),
  findUpcoming: jest.fn(),
  findByDateRange: jest.fn(),
  addTeam: jest.fn(),
  removeTeam: jest.fn(),
  updateRegistration: jest.fn(),
});

/**
 * Create a mock TeamRepository.
 *
 * @returns {object}
 */
const createMockTeamRepository = () => ({
  ...createBaseMock(),
  findByCoach: jest.fn(),
  findByCompetition: jest.fn(),
  addPlayer: jest.fn(),
  removePlayer: jest.fn(),
});

/**
 * Create a mock ScoreRepository.
 *
 * @returns {object}
 */
const createMockScoreRepository = () => ({
  ...createBaseMock(),
  findByCompetition: jest.fn(),
  findByPlayer: jest.fn(),
  findByJudge: jest.fn(),
  calculateAverages: jest.fn(),
});

/**
 * Create a mock TransactionRepository.
 *
 * @returns {object}
 */
const createMockTransactionRepository = () => ({
  ...createBaseMock(),
  findByUser: jest.fn(),
  findByStatus: jest.fn(),
  findByDateRange: jest.fn(),
});

module.exports = {
  createBaseMock,
  createMockPlayerRepository,
  createMockCoachRepository,
  createMockAdminRepository,
  createMockJudgeRepository,
  createMockCompetitionRepository,
  createMockTeamRepository,
  createMockScoreRepository,
  createMockTransactionRepository,
};
