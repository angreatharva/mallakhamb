const express = require('express');
const { getJudges, getSubmittedTeams, saveIndividualScore, getPublicScores, getPublicTeams, getPublicCompetitions } = require('../controllers/adminController');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Optional authentication middleware - adds user/competition context if token is present
const optionalAuth = async (req, res, next) => {
  try {
    // Try to get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token, continue without auth
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      // No token, continue without auth
      return next();
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Add user info to request
      req.user = {
        _id: decoded.id,
        role: decoded.role
      };
      
      // Add competition context if present in token
      if (decoded.currentCompetition) {
        req.competitionId = decoded.currentCompetition;
      }
      
      // Continue with auth context
      next();
    } catch (tokenError) {
      // Token is invalid, but continue without auth (don't fail the request)
      console.log('Optional auth: Invalid token, continuing without auth');
      next();
    }
  } catch (error) {
    // Any error, continue without auth
    console.error('Optional auth error:', error);
    next();
  }
};

// Public routes for judges (optional authentication for competition context)
router.get('/competitions', getPublicCompetitions);
router.get('/judges', getJudges);
router.get('/submitted-teams', optionalAuth, getSubmittedTeams);
router.post('/save-score', optionalAuth, saveIndividualScore);

// Public routes for viewing scores
router.get('/teams', getPublicTeams);
router.get('/scores', getPublicScores);

module.exports = router;