/**
 * User Repository Resolver
 * 
 * Centralised helper that maps a user-type string to its corresponding
 * repository instance. Previously duplicated in AuthenticationService and
 * OTPService (MED-13). The OTP version was also missing the `judge` type.
 * 
 * @module utils/user-repository-resolver
 */

/**
 * Create a repository resolver from the provided repositories.
 *
 * @param {Object} repositories
 * @param {BaseRepository} repositories.playerRepository
 * @param {BaseRepository} repositories.coachRepository
 * @param {BaseRepository} repositories.adminRepository
 * @param {BaseRepository} [repositories.judgeRepository]
 * @returns {{ getRepositoryByType: (userType: string) => BaseRepository }}
 */
function createUserRepositoryResolver(repositories) {
  const {
    playerRepository,
    coachRepository,
    adminRepository,
    judgeRepository = null,
    // The judge PRINCIPAL is an account (src/models/JudgeAccount.js); the judge
    // repository serves panel assignments, which are not logins. Callers that
    // predate the split pass only `judgeRepository`, so it stays the fallback.
    judgeAccountRepository = null,
  } = repositories;

  /**
   * Resolve the repository for a given user type.
   *
   * @param {string} userType - One of 'player', 'coach', 'admin', 'judge'
   * @returns {BaseRepository}
   * @throws {Error} If user type is not recognised
   */
  function getRepositoryByType(userType) {
    switch (userType.toLowerCase()) {
      case 'player':
        return playerRepository;
      case 'coach':
        return coachRepository;
      case 'admin':
        return adminRepository;
      case 'judge': {
        const repository = judgeAccountRepository || judgeRepository;
        if (!repository) {
          throw new Error(`Judge repository not available in this context`);
        }
        return repository;
      }
      default:
        throw new Error(`Invalid user type: ${userType}`);
    }
  }

  return { getRepositoryByType };
}

module.exports = { createUserRepositoryResolver };
