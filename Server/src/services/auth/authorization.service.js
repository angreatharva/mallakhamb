/**
 * Authorization Service
 *
 * What a JUDGE is entitled to, as the socket layer needs to know it: may this
 * account score in this competition, and which panel seats does it hold?
 *
 * WHAT USED TO BE HERE
 *
 * This class also carried a generic RBAC surface — `checkRole`,
 * `checkMinimumRole`, `checkCompetitionAccess`, `checkResourceOwnership`,
 * `checkResourceAccess`, `getUserByType`, `getUserRole`,
 * `checkUserCompetitionAccess`, `getRepositoryByType` and a `roleHierarchy` map
 * of player:1 … superadmin:5. Every one of them was reachable only through
 * `middleware/authorization.middleware.js`, whose three exports were imported
 * only by `middleware/index.js`, which nothing imported at all. The whole chain
 * was dead, and it was misleading: `roleHierarchy` described LEVEL-BASED
 * authorization that this application has never performed. The real guards are
 * in `middleware/auth.middleware.js` and they are flat membership tests
 * (`requireRole`, `requireAdmin`, `requireSequenceManager`, …), plus the
 * assignment-level checks in the services.
 *
 * `getRepositoryByType` here also disagreed with the shared
 * `utils/user-repository-resolver`: it mapped 'judge' to the ASSIGNMENTS
 * collection, where a judge principal's id would never be found.
 *
 * Requirements: 1.2, 1.8
 */

const { loadAssignments } = require('../../utils/data/judge-assignment.util');

class AuthorizationService {
  /**
   * Create an authorization service.
   *
   * The parameter list is unchanged and stays POSITIONAL: `bootstrap.js` wires
   * this constructor by position, so removing a now-unused repository here
   * would silently shift every argument after it.
   *
   * @param {PlayerRepository} playerRepository - retained for wiring compatibility
   * @param {CoachRepository} coachRepository - retained for wiring compatibility
   * @param {AdminRepository} adminRepository - retained for wiring compatibility
   * @param {JudgeRepository} judgeRepository - panel assignments
   * @param {CompetitionRepository} competitionRepository - retained for wiring compatibility
   * @param {Logger} logger - Logger instance
   * @param {JudgeAccountRepository} [judgeAccountRepository] - the judge as a person
   */
  constructor(
    playerRepository,
    coachRepository,
    adminRepository,
    judgeRepository,
    competitionRepository,
    logger,
    // Appended, not inserted — this constructor is wired positionally.
    judgeAccountRepository = null
  ) {
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.judgeRepository = judgeRepository;
    this.judgeAccountRepository = judgeAccountRepository;
    this.competitionRepository = competitionRepository;
    this.logger = logger;
  }

  /**
   * Check if judge can score in a competition
   * @param {string} judgeAccountId - Judge account ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if judge can score
   */
  async canJudgeScore(judgeAccountId, competitionId) {
    try {
      const assignments = await loadAssignments(
        this.judgeRepository,
        judgeAccountId,
        competitionId
      );

      if (assignments.length === 0) {
        this.logger.warn('Judge not assigned to competition', {
          judgeAccountId,
          competitionId,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Can judge score check error', {
        judgeAccountId,
        competitionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get judge details including assignment information
   * @param {string} judgeAccountId - Judge account ID
   * @returns {Promise<Object|null>} Judge document with assignment details or null
   */
  async getJudgeDetails(judgeAccountId) {
    try {
      const account = this.judgeAccountRepository
        ? await this.judgeAccountRepository.findById(judgeAccountId)
        : null;

      const assignments = await loadAssignments(this.judgeRepository, judgeAccountId);

      // A registered judge on no panel is a real principal with nothing to do:
      // the socket auto-join iterates `assignments` and joins no rooms, which
      // is exactly right.
      if (!account && assignments.length === 0) {
        this.logger.warn('Judge not found for details fetch', { judgeAccountId });
        return null;
      }

      const primary = assignments[0] || {};

      return {
        _id: judgeAccountId,
        name: account?.name || '',
        email: account?.email || null,
        judgeType: primary.judgeType || null,
        gender: primary.gender || null,
        ageGroup: primary.ageGroup || null,
        competitionTypes: primary.competitionTypes || [],
        apparatus: primary.apparatus || null,
        competition: primary.competition || null,
        isActive: account ? account.isActive !== false : true,
        judgeNo: primary.judgeNo || null,
        assignments: assignments.map(a => ({
          gender: a.gender,
          ageGroup: a.ageGroup,
          competitionTypes: a.competitionTypes || [],
          apparatus: a.apparatus,
          judgeType: a.judgeType,
          judgeNo: a.judgeNo,
          competition: a.competition,
        }))
      };
    } catch (error) {
      this.logger.error('Get judge details error', {
        judgeAccountId,
        error: error.message
      });
      return null;
    }
  }
}

module.exports = AuthorizationService;
