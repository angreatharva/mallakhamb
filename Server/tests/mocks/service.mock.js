/**
 * Mock Service Implementations
 *
 * Provides Jest mock factories for all domain services.
 * Each factory returns a fresh mock object with all public
 * service methods stubbed out.
 *
 * Requirements: 15.5
 */

// ─── Auth Services ────────────────────────────────────────────────────────────

/**
 * Create a mock AuthenticationService.
 *
 * @returns {object}
 */
const createMockAuthenticationService = () => ({
  login: jest.fn(),
  register: jest.fn(),
  forgotPassword: jest.fn(),
  verifyOTP: jest.fn(),
  resetPasswordWithOTP: jest.fn(),
  setCompetitionContext: jest.fn(),
  findUserByType: jest.fn(),
  findUserAcrossTypes: jest.fn(),
  isEmailTaken: jest.fn(),
  verifyPassword: jest.fn(),
});

/**
 * Create a mock AuthorizationService.
 *
 * @returns {object}
 */
const createMockAuthorizationService = () => ({
  checkRole: jest.fn(),
  checkMinimumRole: jest.fn(),
  checkCompetitionAccess: jest.fn(),
  checkResourceOwnership: jest.fn(),
  checkResourceAccess: jest.fn(),
  getUserRole: jest.fn(),
  canJudgeScore: jest.fn(),
});

/**
 * Create a mock TokenService.
 *
 * @returns {object}
 */
const createMockTokenService = () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
  verifyToken: jest.fn(),
  refreshToken: jest.fn(),
  decodeToken: jest.fn(),
});

/**
 * Create a mock OTPService.
 *
 * @returns {object}
 */
const createMockOTPService = () => ({
  generateOTPCode: jest.fn().mockReturnValue('123456'),
  generateAndSendOTP: jest.fn(),
  verifyOTP: jest.fn(),
  clearOTP: jest.fn(),
});

// ─── User Services ────────────────────────────────────────────────────────────

/**
 * Create a mock UserService.
 *
 * @returns {object}
 */
const createMockUserService = () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
  activateAccount: jest.fn(),
  deactivateAccount: jest.fn(),
});

/**
 * Create a mock PlayerService.
 *
 * @returns {object}
 */
const createMockPlayerService = () => ({
  ...createMockUserService(),
  assignToTeam: jest.fn(),
  removeFromTeam: jest.fn(),
  getPlayersByAgeGroupAndGender: jest.fn(),
  getPlayersByTeam: jest.fn(),
  getActivePlayers: jest.fn(),
});

/**
 * Create a mock CoachService.
 *
 * @returns {object}
 */
const createMockCoachService = () => ({
  ...createMockUserService(),
  assignToTeam: jest.fn(),
  removeFromTeam: jest.fn(),
  getTeam: jest.fn(),
  getActiveCoaches: jest.fn(),
});

/**
 * Create a mock AdminService.
 *
 * @returns {object}
 */
const createMockAdminService = () => ({
  ...createMockUserService(),
  assignCompetition: jest.fn(),
  removeCompetition: jest.fn(),
  hasAccessToCompetition: jest.fn(),
  getAllUsers: jest.fn(),
  activateUser: jest.fn(),
  deactivateUser: jest.fn(),
  getAdminsByRole: jest.fn(),
});

// ─── Competition Services ─────────────────────────────────────────────────────

/**
 * Create a mock CompetitionService.
 *
 * @returns {object}
 */
const createMockCompetitionService = () => ({
  createCompetition: jest.fn(),
  updateCompetition: jest.fn(),
  deleteCompetition: jest.fn(),
  getCompetitionById: jest.fn(),
  getCompetitions: jest.fn(),
  updateCompetitionStatus: jest.fn(),
  getUpcomingCompetitions: jest.fn(),
  getActiveCompetitions: jest.fn(),
  getCompetitionsByStatus: jest.fn(),
});

/**
 * Create a mock RegistrationService.
 *
 * @returns {object}
 */
const createMockRegistrationService = () => ({
  registerTeam: jest.fn(),
  unregisterTeam: jest.fn(),
  addPlayerToRegistration: jest.fn(),
  removePlayerFromRegistration: jest.fn(),
  updateRegistrationStatus: jest.fn(),
  getTeamRegistration: jest.fn(),
  getCompetitionRegistrations: jest.fn(),
});

// ─── Team Service ─────────────────────────────────────────────────────────────

/**
 * Create a mock TeamService.
 *
 * @returns {object}
 */
const createMockTeamService = () => ({
  createTeam: jest.fn(),
  updateTeam: jest.fn(),
  deleteTeam: jest.fn(),
  getTeamById: jest.fn(),
  getTeamsByCoach: jest.fn(),
  addPlayer: jest.fn(),
  removePlayer: jest.fn(),
  validateTeamForCompetition: jest.fn(),
  getTeamRoster: jest.fn(),
});

// ─── Scoring Services ─────────────────────────────────────────────────────────

/**
 * Create a mock ScoringService.
 *
 * @returns {object}
 */
const createMockScoringService = () => ({
  submitScore: jest.fn(),
  updateScore: jest.fn(),
  deleteScore: jest.fn(),
  getScoreById: jest.fn(),
  getScoresByCompetition: jest.fn(),
  lockScore: jest.fn(),
  unlockScore: jest.fn(),
  validateScoreData: jest.fn(),
  validatePlayerScores: jest.fn(),
});

/**
 * Create a mock CalculationService.
 *
 * @returns {object}
 */
const createMockCalculationService = () => ({
  calculateExecutionAverage: jest.fn(),
  calculateFinalScore: jest.fn(),
  calculateRankings: jest.fn(),
  calculateAverage: jest.fn(),
  calculateTimeDeduction: jest.fn(),
  shouldApplyBaseScore: jest.fn(),
  calculateCompletePlayerScore: jest.fn(),
  calculateTeamTotal: jest.fn(),
});

// ─── Cache Service ────────────────────────────────────────────────────────────

/**
 * Create a mock CacheService.
 *
 * @returns {object}
 */
const createMockCacheService = () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  delete: jest.fn(),
  deletePattern: jest.fn(),
  clear: jest.fn(),
  getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0 }),
  wrap: jest.fn().mockImplementation(async (_key, fn) => fn()),
  has: jest.fn().mockReturnValue(false),
  keys: jest.fn().mockReturnValue([]),
  size: jest.fn().mockReturnValue(0),
});

module.exports = {
  // Auth
  createMockAuthenticationService,
  createMockAuthorizationService,
  createMockTokenService,
  createMockOTPService,

  // Users
  createMockUserService,
  createMockPlayerService,
  createMockCoachService,
  createMockAdminService,

  // Competition
  createMockCompetitionService,
  createMockRegistrationService,

  // Team
  createMockTeamService,

  // Scoring
  createMockScoringService,
  createMockCalculationService,

  // Cache
  createMockCacheService,
};
