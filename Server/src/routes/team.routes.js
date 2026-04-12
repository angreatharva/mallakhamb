/**
 * Team Routes
 * 
 * Defines routes for team management endpoints
 * Uses refactored TeamController with validation middleware
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 */

const express = require('express');
const container = require('../infrastructure/di-container');
const { authMiddleware, coachAuth } = require('../../middleware/authMiddleware');
const teamValidator = require('../validators/team.validator');
const { validationResult } = require('express-validator');

const router = express.Router();

// Get controller from DI container
const getTeamController = () => container.resolve('teamController');

// Validation middleware to check validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array().reduce((acc, err) => {
          acc[err.param] = err.msg;
          return acc;
        }, {})
      }
    });
  }
  next();
};

// Public routes
router.get('/', (req, res, next) => getTeamController().getAllTeams(req, res, next));
router.get('/:id', teamValidator.getTeamById(), validate, (req, res, next) => 
  getTeamController().getTeamById(req, res, next)
);
router.get('/:id/stats', teamValidator.getTeamStats(), validate, (req, res, next) => 
  getTeamController().getTeamStats(req, res, next)
);

// Protected routes (coach only)
router.post('/', 
  authMiddleware, 
  coachAuth, 
  teamValidator.createTeam(), 
  validate, 
  (req, res, next) => getTeamController().createTeam(req, res, next)
);

router.put('/:id', 
  authMiddleware, 
  coachAuth, 
  teamValidator.updateTeam(), 
  validate, 
  (req, res, next) => getTeamController().updateTeam(req, res, next)
);

router.delete('/:id', 
  authMiddleware, 
  coachAuth, 
  teamValidator.deleteTeam(), 
  validate, 
  (req, res, next) => getTeamController().deleteTeam(req, res, next)
);

// Player management routes
router.post('/:id/players', 
  authMiddleware, 
  coachAuth, 
  teamValidator.addPlayer(), 
  validate, 
  (req, res, next) => getTeamController().addPlayer(req, res, next)
);

router.delete('/:id/players', 
  authMiddleware, 
  coachAuth, 
  teamValidator.removePlayer(), 
  validate, 
  (req, res, next) => getTeamController().removePlayer(req, res, next)
);

module.exports = router;
