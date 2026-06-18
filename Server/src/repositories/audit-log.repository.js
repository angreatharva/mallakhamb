const BaseRepository = require('./base.repository');
const AuditLog = require('../models/AuditLog');

class AuditLogRepository extends BaseRepository {
  constructor(logger) {
    super(AuditLog, logger);
  }

  /**
   * Log an admin action
   * @param {Object} data 
   * @param {string} data.adminId
   * @param {string} data.adminType
   * @param {string} data.action
   * @param {string} data.resource
   * @param {string} data.resourceId
   * @param {Object} data.details
   * @param {string} data.ipAddress
   * @param {string} data.userAgent
   * @returns {Promise<Object>}
   */
  async logAction(data) {
    return this.create(data);
  }

  /**
   * Get audit logs with filtering and pagination
   * @param {Object} query
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async getAuditLogs(query = {}, options = {}) {
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const skip = (page - 1) * limit;

    const data = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('adminId', 'name email username role')
      .lean();

    const total = await this.model.countDocuments(query);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = AuditLogRepository;
