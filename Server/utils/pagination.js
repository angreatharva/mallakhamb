/**
 * Pagination Utility
 * Provides consistent pagination across all list endpoints
 */

/**
 * Apply pagination to a Mongoose query
 * @param {Query} query - Mongoose query object
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Query} - Query with skip and limit applied
 */
const paginate = (query, page = 1, limit = 20) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  
  // Ensure positive values
  const safePage = Math.max(1, pageNum);
  const safeLimit = Math.min(Math.max(1, limitNum), 100); // Max 100 items per page
  
  const skip = (safePage - 1) * safeLimit;
  
  return query.skip(skip).limit(safeLimit);
};

/**
 * Get pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
const getPaginationMeta = (total, page = 1, limit = 20) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  
  const safePage = Math.max(1, pageNum);
  const safeLimit = Math.min(Math.max(1, limitNum), 100);
  
  const totalPages = Math.ceil(total / safeLimit);
  
  return {
    currentPage: safePage,
    itemsPerPage: safeLimit,
    totalItems: total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1
  };
};

module.exports = { paginate, getPaginationMeta };
