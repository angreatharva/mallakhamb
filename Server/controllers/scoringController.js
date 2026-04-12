/**
 * Scoring Controller
 * 
 * Handles scoring HTTP endpoints by delegating to ScoringService.
 * Uses asyncHandler for error handling and validation middleware.
 * 
 * This controller handles:
 * - Score submission
 * - Score updates
 * - Score deletion
 * - Score retrieval with filtering
 * - Score locking/unlocking
 * 
 * Requirements: 1.2, 1.5, 19.1, 19.2
 */

const { asyncHandler } = require('../src/middleware/error.middleware');
const container = require('../src/infrastructure/di-container');

/**
 * Submit a new score
 * 
 * @route POST /api/scores
 * @access Protected (requires authentication)
 */
const submitScore = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const scoreData = req.body;

  const score = await scoringService.submitScore(scoreData);

  res.status(201).json({
    success: true,
    message: 'Score submitted successfully',
    score
  });
});

/**
 * Update an existing score
 * 
 * @route PUT /api/scores/:scoreId
 * @access Protected (requires authentication)
 */
const updateScore = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { scoreId } = req.params;
  const updates = req.body;

  const score = await scoringService.updateScore(scoreId, updates);

  res.json({
    success: true,
    message: 'Score updated successfully',
    score
  });
});

/**
 * Delete a score
 * 
 * @route DELETE /api/scores/:scoreId
 * @access Protected (requires authentication)
 */
const deleteScore = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { scoreId } = req.params;

  await scoringService.deleteScore(scoreId);

  res.json({
    success: true,
    message: 'Score deleted successfully'
  });
});

/**
 * Get score by ID
 * 
 * @route GET /api/scores/:scoreId
 * @access Protected (requires authentication)
 */
const getScoreById = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { scoreId } = req.params;

  const score = await scoringService.getScoreById(scoreId);

  res.json({
    success: true,
    score
  });
});

/**
 * Get scores by competition
 * 
 * @route GET /api/scores/competition/:competitionId
 * @access Protected (requires authentication)
 */
const getScoresByCompetition = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { competitionId } = req.params;
  
  // Extract filters from query params
  const filters = {};
  if (req.query.gender) {
    filters.gender = req.query.gender;
  }
  if (req.query.ageGroup) {
    filters.ageGroup = req.query.ageGroup;
  }
  if (req.query.competitionType) {
    filters.competitionType = req.query.competitionType;
  }

  const scores = await scoringService.getScoresByCompetition(competitionId, filters);

  res.json({
    success: true,
    count: scores.length,
    scores
  });
});

/**
 * Lock a score to prevent modifications
 * 
 * @route PATCH /api/scores/:scoreId/lock
 * @access Protected (requires authentication)
 */
const lockScore = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { scoreId } = req.params;

  const score = await scoringService.lockScore(scoreId);

  res.json({
    success: true,
    message: 'Score locked successfully',
    score
  });
});

/**
 * Unlock a score to allow modifications
 * 
 * @route PATCH /api/scores/:scoreId/unlock
 * @access Protected (requires authentication)
 */
const unlockScore = asyncHandler(async (req, res) => {
  const scoringService = container.resolve('scoringService');
  const { scoreId } = req.params;

  const score = await scoringService.unlockScore(scoreId);

  res.json({
    success: true,
    message: 'Score unlocked successfully',
    score
  });
});

module.exports = {
  submitScore,
  updateScore,
  deleteScore,
  getScoreById,
  getScoresByCompetition,
  lockScore,
  unlockScore
};
