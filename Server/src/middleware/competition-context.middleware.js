/**
 * Competition Context Middleware
 * 
 * Validates that a competition context is set for the current request
 * 
 * @module middleware/competition-context.middleware
 */

const { ValidationError } = require('../errors');

/**
 * Middleware to validate competition context
 * Checks if user has a current competition set
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateCompetitionContext = (req, res, next) => {
  // Check if competition ID is in user object (from token)
  // Priority: token > header > body > query
  const competitionId = req.user?.currentCompetition || 
                        req.headers['x-competition-id'] ||
                        req.body?.competitionId ||
                        req.query?.competitionId;

  if (!competitionId) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Competition context is required. Please set a competition first.',
        code: 'COMPETITION_CONTEXT_REQUIRED'
      }
    });
  }

  // Attach competition ID to request for downstream use
  req.competitionId = competitionId;
  
  next();
};

module.exports = {
  validateCompetitionContext
};
