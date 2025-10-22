const express = require('express');
const { body } = require('express-validator');
const {
  getAllTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  getTeamStats
} = require('../controllers/teamController');
const { authMiddleware, coachAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware
const updateTeamValidation = [
  body('name').optional().trim().notEmpty().withMessage('Team name cannot be empty'),
  body('description').optional().trim()
];

// Public routes
router.get('/', getAllTeams);
router.get('/:id', getTeamById);
router.get('/:id/stats', getTeamStats);

// Protected routes (coach only)
router.put('/:id', authMiddleware, coachAuth, updateTeamValidation, updateTeam);
router.delete('/:id', authMiddleware, coachAuth, deleteTeam);

module.exports = router;
