const express = require('express');
const { getJudges, getSubmittedTeams, saveIndividualScore, getPublicScores, getPublicTeams } = require('../controllers/adminController');

const router = express.Router();

// Public routes for judges (no authentication required)
router.get('/judges', getJudges);
router.get('/submitted-teams', getSubmittedTeams);
router.post('/save-score', saveIndividualScore);

// Public routes for viewing scores
router.get('/teams', getPublicTeams);
router.get('/scores', getPublicScores);

module.exports = router;