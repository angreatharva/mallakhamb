/**
 * Pagination Utility
 * Provides consistent pagination across all list endpoints.
 *
 * Moved from Server/utils/pagination.js
 */

/**
 * Apply pagination to a Mongoose query
 * @param {import('mongoose').Query} query - Mongoose query object
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {import('mongoose').Query} Query with skip and limit applied
 */
const paginate = (query, page = 1, limit = 20) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100); // max 100 per page

  return query.skip((safePage - 1) * safeLimit).limit(safeLimit);
};

/**
 * Get pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {{ currentPage: number, itemsPerPage: number, totalItems: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }}
 */
const getPaginationMeta = (total, page = 1, limit = 20) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
  const totalPages = Math.ceil(total / safeLimit);

  return {
    currentPage: safePage,
    itemsPerPage: safeLimit,
    totalItems: total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
};

module.exports = { paginate, getPaginationMeta };
