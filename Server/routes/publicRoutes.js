const express = require('express');
const { getJudges, getSubmittedTeams, saveIndividualScore } = require('../controllers/adminController');

const router = express.Router();

// Public routes for judges (no authentication required)
router.get('/judges', getJudges);
router.get('/submitted-teams', getSubmittedTeams);
router.post('/save-score', saveIndividualScore);

module.exports = router;