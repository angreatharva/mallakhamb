const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  loginSuperAdmin,
  getAdminProfile,
  getDashboardStats,
  getSuperAdminDashboard,
  getAllTeams,
  getTeamDetails,
  addScore,
  getTeamScores,
  getIndividualScores,
  getAllPlayers,
  getSubmittedTeams,
  saveJudges,
  getJudges,
  getAllJudgesSummary,
  createSingleJudge,
  updateJudge,
  startAgeGroup,
  saveScores,
  unlockScores,
  getTeamRankings,
  // Super Admin specific
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getSystemStats,
  getAllCoaches,
  updateCoachStatus,
  deleteTeam,
  deleteJudge,
  getAllTeamsForSuperAdmin,
  // Competition management
  createCompetition,
  getAllCompetitions,
  getCompetitionById,
  updateCompetition,
  deleteCompetition,
  assignAdminToCompetition,
  removeAdminFromCompetition
} = require('../controllers/superAdminController');
const { authMiddleware, superAdminAuth } = require('../middleware/authMiddleware');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const addScoreValidation = [
  body('playerId').isMongoId().withMessage('Valid player ID is required'),
  body('teamId').isMongoId().withMessage('Valid team ID is required'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('score')
    .isNumeric()
    .withMessage('Score must be a number')
    .isFloat({ min: 0 })
    .withMessage('Score must be a positive number'),
  body('event').trim().notEmpty().withMessage('Event name is required')
];

const saveJudgesValidation = [
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('judges')
    .isArray({ min: 5, max: 5 })
    .withMessage('Exactly 5 judges must be provided')
  // Removed individual field validation to allow empty judges
];

const updateJudgeValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Judge name is required'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Judge username is required'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Judge password is required')
];

const createCompetitionValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Competition name is required'),
  body('level')
    .isIn(['state', 'national', 'international'])
    .withMessage('Level must be state, national, or international'),
  body('place')
    .trim()
    .notEmpty()
    .withMessage('Competition place is required'),
  body('year')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Competition year is required and must be between 2000 and 2100'),
  body('startDate')
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('endDate')
    .isISO8601()
    .withMessage('Valid end date is required')
    .custom((endDate, { req }) => {
      if (new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date cannot be before start date');
      }
      return true;
    }),
  body('admins')
    .isArray({ min: 1 })
    .withMessage('At least one admin must be assigned'),
  body('admins.*')
    .isMongoId()
    .withMessage('Each admin ID must be valid'),
  body('ageGroups')
    .isArray({ min: 1 })
    .withMessage('At least one age group must be selected'),
  body('ageGroups.*.gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be Male or Female'),
  body('ageGroups.*.ageGroup')
    .isIn(['Under8', 'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'])
    .withMessage('Valid age group is required')
];

const updateCompetitionValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Competition name cannot be empty'),
  body('level')
    .optional()
    .isIn(['state', 'national', 'international'])
    .withMessage('Level must be state, national, or international'),
  body('place')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Competition place cannot be empty'),
  body('year')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Year must be between 2000 and 2100'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Valid end date is required'),
  body('status')
    .optional()
    .isIn(['upcoming', 'ongoing', 'completed'])
    .withMessage('Status must be upcoming, ongoing, or completed'),
  body('ageGroups')
    .optional()
    .isArray()
    .withMessage('ageGroups must be an array'),
  body('ageGroups.*.gender')
    .optional()
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be Male or Female'),
  body('ageGroups.*.ageGroup')
    .optional()
    .isIn(['Under8', 'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'])
    .withMessage('Valid age group is required')
];

const assignAdminValidation = [
  body('adminId')
    .isMongoId()
    .withMessage('Valid admin ID is required')
];

const createSingleJudgeValidation = [
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('judgeNo')
    .isInt({ min: 1, max: 5 })
    .withMessage('Judge number must be between 1 and 5'),
  body('judgeType')
    .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'])
    .withMessage('Valid judge type is required'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Judge name is required'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Judge username is required'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Judge password is required')
];

// Public routes
router.post('/login', loginValidation, handleValidationErrors, loginSuperAdmin);

// Protected routes - Super Admin only
router.get('/profile', authMiddleware, superAdminAuth, getAdminProfile);
router.get('/dashboard', authMiddleware, superAdminAuth, getSuperAdminDashboard);
router.get('/system-stats', authMiddleware, superAdminAuth, getSystemStats);

// Admin management routes (Super Admin only)
router.get('/admins', authMiddleware, superAdminAuth, getAllAdmins);
router.post('/admins', authMiddleware, superAdminAuth, registerValidation, handleValidationErrors, createAdmin);
router.put('/admins/:adminId', authMiddleware, superAdminAuth, updateAdmin);
router.delete('/admins/:adminId', authMiddleware, superAdminAuth, deleteAdmin);

// Coach management routes (Super Admin only)
router.get('/coaches', authMiddleware, superAdminAuth, getAllCoaches);
router.put('/coaches/:coachId/status', authMiddleware, superAdminAuth, updateCoachStatus);

// Team routes
router.get('/teams', authMiddleware, superAdminAuth, getAllTeamsForSuperAdmin);
router.get('/teams/:teamId', authMiddleware, superAdminAuth, getTeamDetails);
router.delete('/teams/:teamId', authMiddleware, superAdminAuth, deleteTeam);
router.get('/players', authMiddleware, superAdminAuth, getAllPlayers);

// Score routes
router.post('/scores', authMiddleware, superAdminAuth, addScoreValidation, addScore);
router.post('/scores/save', authMiddleware, superAdminAuth, saveScores);
router.put('/scores/:scoreId/unlock', authMiddleware, superAdminAuth, unlockScores);
router.get('/scores/teams', authMiddleware, superAdminAuth, getTeamScores);
router.get('/scores/individual', authMiddleware, superAdminAuth, getIndividualScores);
router.get('/scores/team-rankings', authMiddleware, superAdminAuth, getTeamRankings);

// Submitted teams route
router.get('/submitted-teams', authMiddleware, superAdminAuth, getSubmittedTeams);

// Judge routes
router.post('/judges', authMiddleware, superAdminAuth, saveJudgesValidation, handleValidationErrors, saveJudges);
router.post('/judges/single', authMiddleware, superAdminAuth, createSingleJudgeValidation, handleValidationErrors, createSingleJudge);
router.get('/judges', authMiddleware, superAdminAuth, getJudges);
router.get('/judges/summary', authMiddleware, superAdminAuth, getAllJudgesSummary);
router.put('/judges/:judgeId', authMiddleware, superAdminAuth, updateJudgeValidation, handleValidationErrors, updateJudge);
router.delete('/judges/:judgeId', authMiddleware, superAdminAuth, deleteJudge);

// Competition management routes
router.post('/competition/age-group/start', authMiddleware, superAdminAuth, startAgeGroup);

// Competition management routes (Super Admin only)
router.post('/competitions', authMiddleware, superAdminAuth, createCompetitionValidation, handleValidationErrors, createCompetition);
router.get('/competitions', authMiddleware, superAdminAuth, getAllCompetitions);
router.get('/competitions/:id', authMiddleware, superAdminAuth, getCompetitionById);
router.put('/competitions/:id', authMiddleware, superAdminAuth, updateCompetitionValidation, handleValidationErrors, updateCompetition);
router.delete('/competitions/:id', authMiddleware, superAdminAuth, deleteCompetition);
router.post('/competitions/:id/admins', authMiddleware, superAdminAuth, assignAdminValidation, handleValidationErrors, assignAdminToCompetition);
router.delete('/competitions/:id/admins/:adminId', authMiddleware, superAdminAuth, removeAdminFromCompetition);

// Player management routes (Super Admin only)
const addPlayerValidation = [
  body('name').trim().notEmpty().withMessage('Player name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('gender').isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('team').isMongoId().withMessage('Valid team ID is required'),
  body('competition').isMongoId().withMessage('Valid competition ID is required'),
  body('paymentStatus').isIn(['pending', 'completed', 'failed']).withMessage('Valid payment status is required')
];

router.post('/players/add', authMiddleware, superAdminAuth, addPlayerValidation, handleValidationErrors, async (req, res) => {
  try {
    const Player = require('../models/Player');
    const Team = require('../models/Team');
    const bcrypt = require('bcryptjs');

    const { name, email, password, phone, dateOfBirth, gender, team: teamId, competition: competitionId, paymentStatus } = req.body;

    // Check if player already exists
    const existingPlayer = await Player.findOne({ email });
    if (existingPlayer) {
      return res.status(400).json({ message: 'Player with this email already exists' });
    }

    // Verify team exists and belongs to the competition
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.competitionId.toString() !== competitionId) {
      return res.status(400).json({ message: 'Team does not belong to the selected competition' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create player
    const player = new Player({
      name,
      email,
      password: hashedPassword,
      phone,
      dateOfBirth,
      gender,
      team: teamId,
      paymentStatus,
      isActive: true
    });

    await player.save();

    res.status(201).json({
      message: 'Player added successfully',
      player: {
        id: player._id,
        name: player.name,
        email: player.email,
        team: teamId
      }
    });
  } catch (error) {
    console.error('Add player error:', error);
    res.status(500).json({ message: 'Failed to add player', error: error.message });
  }
});

module.exports = router;
