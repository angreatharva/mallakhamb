/**
 * Authorization Middleware
 * 
 * Refactored to use AuthorizationService
 * Handles permission checks and competition context validation
 * 
 * Requirements: 1.2, 13.3, 19.1
 */

const { AuthorizationError, NotFoundError } = require('../errors');

/**
 * Create competition context validation middleware
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createCompetitionContextMiddleware(container) {
  const authorizationService = container.resolve('authorizationService');
  const competitionRepository = container.resolve('competitionRepository');
  const logger = container.resolve('logger');

  return async (req, res, next) => {
    try {
      // Player GET /teams can work without competition context
      const isPlayerGetTeams =
        req.userType === 'player' &&
        req.method === 'GET' &&
        (req.path === '/teams' || req.originalUrl?.includes('/players/teams'));
      
      if (isPlayerGetTeams) {
        return next();
      }

      // Super Admin dashboard can work without competition context
      const isSuperAdminDashboard =
        (req.userType === 'superadmin' || req.user?.role === 'super_admin') &&
        req.method === 'GET' &&
        (req.path === '/dashboard' || req.originalUrl?.includes('/superadmin/dashboard'));
      
      if (isSuperAdminDashboard) {
        return next();
      }

      // Extract competition ID from token or header
      let competitionId = req.user?.currentCompetition || req.headers['x-competition-id'];

      if (!competitionId) {
        logger.warn('Competition context missing', {
          userId: req.user?._id,
          userType: req.userType,
          path: req.path
        });
        return res.status(400).json({
          success: false,
          error: {
            message: 'Competition context is required for this operation',
            code: 'MISSING_COMPETITION_CONTEXT'
          }
        });
      }

      // Validate competition exists
      const competition = await competitionRepository.findById(competitionId);

      if (!competition) {
        logger.warn('Competition not found', {
          competitionId,
          userId: req.user?._id,
          userType: req.userType
        });
        return res.status(404).json({
          success: false,
          error: {
            message: 'The specified competition does not exist or has been deleted',
            code: 'COMPETITION_NOT_FOUND',
            competitionId
          }
        });
      }

      // Check if competition is deleted (soft delete)
      if (competition.isDeleted) {
        logger.warn('Competition deleted', {
          competitionId,
          userId: req.user?._id,
          userType: req.userType
        });
        return res.status(403).json({
          success: false,
          error: {
            message: 'This competition has been deleted and is no longer accessible',
            code: 'COMPETITION_DELETED',
            competitionId
          }
        });
      }

      // Check user access using AuthorizationService
      try {
        await authorizationService.checkCompetitionAccess(
          req.user._id.toString(),
          req.userType,
          competitionId
        );
      } catch (error) {
        if (error instanceof AuthorizationError) {
          logger.warn('Competition access denied', {
            userId: req.user._id,
            userType: req.userType,
            competitionId,
            reason: error.message
          });
          return res.status(403).json({
            success: false,
            error: {
              message: error.message || 'You do not have access to this competition',
              code: 'COMPETITION_ACCESS_DENIED',
              competitionId
            }
          });
        }
        throw error;
      }

      // Attach competition context to request
      req.competitionId = competitionId;
      req.competition = competition;

      logger.debug('Competition context validated', {
        userId: req.user._id,
        userType: req.userType,
        competitionId
      });

      next();
    } catch (error) {
      logger.error('Competition context middleware error', {
        userId: req.user?._id,
        userType: req.userType,
        path: req.path,
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to validate competition context',
          code: 'COMPETITION_CONTEXT_ERROR'
        }
      });
    }
  };
}

/**
 * Create resource ownership validation middleware
 * @param {Function} getResourceOwnerId - Function to extract resource owner ID from request
 * @returns {Function} Express middleware
 */
function requireResourceOwnership(getResourceOwnerId) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        });
      }

      const resourceOwnerId = await getResourceOwnerId(req);

      if (!resourceOwnerId) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Resource not found',
            code: 'RESOURCE_NOT_FOUND'
          }
        });
      }

      const isOwner = req.user._id.toString() === resourceOwnerId.toString();

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'You do not own this resource',
            code: 'NOT_RESOURCE_OWNER'
          }
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to validate resource ownership',
          code: 'OWNERSHIP_CHECK_ERROR'
        }
      });
    }
  };
}

/**
 * Create permission check middleware
 * @param {Object} container - DI container
 * @param {string|string[]} requiredRoles - Required roles
 * @returns {Function} Express middleware
 */
function requirePermission(container, ...requiredRoles) {
  const authorizationService = container.resolve('authorizationService');
  const logger = container.resolve('logger');

  return async (req, res, next) => {
    try {
      if (!req.user || !req.userType) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        });
      }

      const roles = requiredRoles.flat();

      try {
        await authorizationService.checkRole(
          req.user._id.toString(),
          req.userType,
          roles
        );
      } catch (error) {
        if (error instanceof AuthorizationError) {
          logger.warn('Permission denied', {
            userId: req.user._id,
            userType: req.userType,
            requiredRoles: roles,
            path: req.path
          });
          return res.status(403).json({
            success: false,
            error: {
              message: error.message || 'Insufficient permissions',
              code: 'INSUFFICIENT_PERMISSIONS',
              requiredRoles: roles
            }
          });
        }
        throw error;
      }

      next();
    } catch (error) {
      logger.error('Permission check error', {
        userId: req.user?._id,
        userType: req.userType,
        path: req.path,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to check permissions',
          code: 'PERMISSION_CHECK_ERROR'
        }
      });
    }
  };
}

module.exports = {
  createCompetitionContextMiddleware,
  requireResourceOwnership,
  requirePermission
};
