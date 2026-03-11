/**
 * Score Validation Utility
 * Validates score values to ensure they are within acceptable range
 */

/**
 * Validate a score value
 * @param {*} score - The score to validate
 * @returns {number} - Validated score as a number
 * @throws {Error} - If score is invalid
 */
const validateScore = (score) => {
  const numScore = parseFloat(score);
  
  if (isNaN(numScore)) {
    throw new Error('Score must be a valid number');
  }
  
  if (numScore < 0 || numScore > 10) {
    throw new Error('Score must be between 0 and 10');
  }
  
  return numScore;
};

module.exports = { validateScore };
