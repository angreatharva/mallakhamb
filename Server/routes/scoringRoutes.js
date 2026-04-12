const express = require('express');
const {
  submitScore,
  updateScore,
  deleteScore,
  getScoreById,
  getScoresByCompetition,
  lockScore,
  unlockScore
} = require('../controllers/scoringController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { handleExpressValidationErrors } = require('../middleware/errorHandler');
const scoringValidators = require('../src/validators/scoring.validator');

const router = express.Router();

// All scoring routes require authentication
router.use(authMiddleware);

// Score CRUD operations
router.post('/', scoringValidators.submitScore(), handleExpressValidationErrors, submitScore);
router.get('/:scoreId', scoringValidators.getScoreById(), handleExpressValidationErrors, getScoreById);
router.put('/:scoreId', scoringValidators.updateScore(), handleExpressValidationErrors, updateScore);
router.delete('/:scoreId', scoringValidators.deleteScore(), handleExpressValidationErrors, deleteScore);

// Score retrieval by competition
router.get('/competition/:competitionId', scoringValidators.getScoresByCompetition(), handleExpressValidationErrors, getScoresByCompetition);

// Score locking operations
router.patch('/:scoreId/lock', scoringValidators.getScoreById(), handleExpressValidationErrors, lockScore);
router.patch('/:scoreId/unlock', scoringValidators.getScoreById(), handleExpressValidationErrors, unlockScore);

module.exports = router;
