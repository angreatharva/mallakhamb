const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const { isTokenInvalidated } = require('../utils/tokenInvalidation');
const { logCompetitionContextFailure } = require('./securityLogger');

/**
 * Middleware to validate and enforce competition context
 * Extracts competition ID from JWT token or x-competition-id header
 * Validates user has access to the competition
 * Attaches req.competitionId to request object
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateCompetitionContext = async (req, res, next) => {
  try {
    // Extract competition ID from JWT token (preferred) or x-competition-id header (fallback)
    let competitionId = req.user?.currentCompetition || req.headers['x-competition-id'];

    // Check if competition context is missing
    if (!competitionId) {
      logCompetitionContextFailure(
        req.user?._id,
        req.userType,
        null,
        'Missing competition context',
        req
      );
      return res.status(400).json({
        error: 'Missing Competition Context',
        message: 'Competition context is required for this operation'
      });
    }

    // Validate competition ID format (must be valid ObjectId)
    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      logCompetitionContextFailure(
        req.user?._id,
        req.userType,
        competitionId,
        'Invalid competition ID format',
        req
      );
      return res.status(400).json({
        error: 'Invalid Competition ID',
        message: 'Competition ID must be a valid ObjectId',
        value: competitionId
      });
    }

    // Verify competition exists and is not deleted
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      logCompetitionContextFailure(
        req.user?._id,
        req.userType,
        competitionId,
        'Competition not found',
        req
      );
      return res.status(404).json({
        error: 'Competition Not Found',
        message: 'The specified competition does not exist or has been deleted',
        competitionId
      });
    }

    // Check if competition is marked as deleted (soft delete)
    if (competition.isDeleted) {
      logCompetitionContextFailure(
        req.user?._id,
        req.userType,
        competitionId,
        'Competition deleted',
        req
      );
      return res.status(403).json({
        error: 'Competition Deleted',
        message: 'This competition has been deleted and is no longer accessible',
        competitionId
      });
    }

    // Validate user has access to competition
    // Super admins have access to all competitions
    if (req.userType === 'superadmin' || req.user.role === 'super_admin') {
      req.competitionId = competitionId;
      req.competition = competition;
      return next();
    }

    // For admins, check if they are assigned to this competition
    if (req.userType === 'admin') {
      // First check if their token has been invalidated
      if (req.user.currentCompetition) {
        // Token has competition context, verify it's still valid
        const tokenData = req.headers.authorization?.replace('Bearer ', '');
        if (tokenData) {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.decode(tokenData);
          if (decoded && decoded.iat && isTokenInvalidated(req.user._id.toString(), decoded.iat)) {
            return res.status(401).json({
              error: 'Token Invalidated',
              message: 'Your competition assignments have changed. Please select a competition again.',
              code: 'TOKEN_INVALIDATED_ASSIGNMENT_CHANGE'
            });
          }
        }
      }
      
      if (!req.user.hasAccessToCompetition(competitionId)) {
        logCompetitionContextFailure(
          req.user._id,
          req.userType,
          competitionId,
          'Admin not assigned to competition',
          req
        );
        return res.status(403).json({
          error: 'Access Denied',
          message: 'You do not have access to this competition',
          competitionId
        });
      }
    }

    // For coaches, players, and judges, additional validation will be done at the controller level
    // based on their team/judge assignments to the competition

    // Attach competition context and competition object to request
    req.competitionId = competitionId;
    req.competition = competition;
    next();
  } catch (error) {
    console.error('Competition context validation error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate competition context'
    });
  }
};

module.exports = {
  validateCompetitionContext
};
