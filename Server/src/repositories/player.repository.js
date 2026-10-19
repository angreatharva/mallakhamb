/**
 * Player Repository
 * 
 * Domain-specific repository for Player model.
 * Provides methods for player data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5, 16.3
 */

const BaseRepository = require('./base.repository');
const Player = require('../models/Player');
const { pageMeta } = require('../utils/data/pagination.util');
const { OWN_EMAIL_CLAUSE, normalizeLoginId } = require('../utils/data/player-login-id.util');

/** Attempts at a fresh Player ID when a concurrent registration took ours. */
const LOGIN_ID_RETRIES = 5;

const isLoginIdCollision = (error) =>
  error?.code === 11000 && /loginId|player_login_id_unique/.test(String(error.message));

class PlayerRepository extends BaseRepository {
  /**
   * Create a player repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Player, logger);
  }

  /**
   * Create a player, retrying when a concurrent registration took the same
   * Player ID first. The model's pre-validate hook picks the next free one on
   * each attempt; a caller-supplied `loginId` is never retried.
   *
   * Takes no options, like BaseRepository.create: the super admin's add-player
   * passes `{ session }` and it has always been ignored.
   * @param {Object|Object[]} data
   * @returns {Promise<Object|Object[]>}
   */
  async create(data) {
    const assigned = Array.isArray(data) ? data.some((d) => d?.loginId) : Boolean(data?.loginId);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await super.create(data);
      } catch (error) {
        if (assigned || !isLoginIdCollision(error) || attempt >= LOGIN_ID_RETRIES) throw error;
        this.logger.warn('PlayerRepository.create: Player ID taken concurrently, retrying', { attempt });
      }
    }
  }

  /**
   * Find the player whose OWN address this is — the account an email signs in
   * to. A guardian's address is shared by siblings and never identifies one
   * player, so those accounts are not found here; see findByGuardianEmail.
   * @param {string} email - Player email
   * @param {Object} options - Query options. Login passes { select: '+password' },
   *   which is required because `password` is `select: false` on the schema.
   * @returns {Promise<Object|null>} Player document or null
   */
  async findByEmail(email, options = {}) {
    try {
      return await this.findOne({ email: email.toLowerCase(), ...OWN_EMAIL_CLAUSE }, options);
    } catch (error) {
      this.logger.error('PlayerRepository.findByEmail error', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Find a player by Player ID, in any case the user typed it.
   * @param {string} loginId
   * @param {Object} options - as for findByEmail
   * @returns {Promise<Object|null>}
   */
  async findByLoginId(loginId, options = {}) {
    const normalized = normalizeLoginId(loginId);
    if (!normalized) return null;
    try {
      return await this.findOne({ loginId: normalized }, options);
    } catch (error) {
      this.logger.error('PlayerRepository.findByLoginId error', { error: error.message });
      throw error;
    }
  }

  /**
   * Every player who registered with this address as a guardian's — the
   * children a "forgot my Player ID" email lists.
   * @param {string} email
   * @returns {Promise<Array>}
   */
  async findByGuardianEmail(email) {
    try {
      return await this.find(
        { email: email.toLowerCase(), emailType: 'guardian', isActive: { $ne: false } },
        { select: 'firstName lastName loginId', sort: { createdAt: 1 } }
      );
    } catch (error) {
      this.logger.error('PlayerRepository.findByGuardianEmail error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find active players
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active players
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isActive: true }, options);
    } catch (error) {
      this.logger.error('PlayerRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find players by team
   * @param {string} teamId - Team ID
   * @returns {Promise<Array>} Array of players in the team
   */
  async findByTeam(teamId) {
    try {
      return await this.find({ team: teamId, isActive: true });
    } catch (error) {
      this.logger.error('PlayerRepository.findByTeam error', { teamId, error: error.message });
      throw error;
    }
  }

  /**
   * Find players by age group and gender
   * @param {string} ageGroup - Age group (Under10, Under12, etc.)
   * @param {string} gender - Gender (Male, Female)
   * @returns {Promise<Array>} Array of players matching criteria
   */
  async findByAgeGroupAndGender(ageGroup, gender) {
    try {
      return await this.find({ ageGroup, gender, isActive: true });
    } catch (error) {
      this.logger.error('PlayerRepository.findByAgeGroupAndGender error', { 
        ageGroup, 
        gender, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update player team
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID (or null to remove from team)
   * @returns {Promise<Object|null>} Updated player document
   */
  async updateTeam(playerId, teamId) {
    try {
      return await this.updateById(playerId, { team: teamId });
    } catch (error) {
      this.logger.error('PlayerRepository.updateTeam error', { 
        playerId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Is this address already some player's OWN email? Only those are unique —
   * a guardian's address may be shared by any number of siblings.
   * @param {string} email - Email to check
   * @param {string} excludeId - Player ID to exclude from check (optional)
   * @returns {Promise<boolean>} True if email is taken
   */
  async isEmailTaken(email, excludeId = null) {
    try {
      const criteria = { email: email.toLowerCase(), ...OWN_EMAIL_CLAUSE };
      if (excludeId) {
        criteria._id = { $ne: excludeId };
      }
      return await this.exists(criteria);
    } catch (error) {
      this.logger.error('PlayerRepository.isEmailTaken error', { 
        email, 
        excludeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find players with pagination
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} { players, total, page, pages }
   */
  async findPaginated(filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const criteria = { ...filters };
      
      const [players, total] = await Promise.all([
        this.find(criteria, { skip, limit, sort: { createdAt: -1 } }),
        this.count(criteria)
      ]);
      
      return { players, ...pageMeta(total, page, limit) };
    } catch (error) {
      this.logger.error('PlayerRepository.findPaginated error', { 
        filters, 
        page, 
        limit, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = PlayerRepository;
