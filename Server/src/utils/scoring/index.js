/**
 * Scoring Utilities Index
 * 
 * Exports all scoring utility functions for easy importing
 */

const calculationUtil = require('./calculation.util');
const tieBreakerUtil = require('./tie-breaker.util');
const rankingUtil = require('./ranking.util');

module.exports = {
  // Calculation utilities
  ...calculationUtil,
  
  // Tie-breaker utilities
  ...tieBreakerUtil,
  
  // Ranking utilities
  ...rankingUtil
};
