const express = require('express');
const { body } = require('express-validator');
const {
  registerPlayer,
  loginPlayer,
  getPlayerProfile,
  updatePlayerTeam,
  getTeams
} = require('../controllers/playerController');
const { authMiddleware, playerAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('aadharNumber')
    .isLength({ min: 12, max: 12 })
    .withMessage('Aadhar number must be exactly 12 digits')
    .isNumeric()
    .withMessage('Aadhar number must contain only digits')
    .custom((value) => {
      if (value.startsWith('0') || value.startsWith('1')) {
        throw new Error('Aadhar number cannot start with 0 or 1');
      }
      return true;
    }),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female')
];

const loginValidation = [
  body('aadharNumber')
    .isLength({ min: 12, max: 12 })
    .withMessage('Aadhar number must be exactly 12 digits')
    .isNumeric()
    .withMessage('Aadhar number must contain only digits')
    .custom((value) => {
      if (value.startsWith('0') || value.startsWith('1')) {
        throw new Error('Aadhar number cannot start with 0 or 1');
      }
      return true;
    }),
  body('password').notEmpty().withMessage('Password is required')
];

// Public routes
router.post('/register', registerValidation, registerPlayer);
router.post('/login', loginValidation, loginPlayer);
router.get('/teams', getTeams);

// Protected routes
router.get('/profile', authMiddleware, playerAuth, getPlayerProfile);
router.put('/team', authMiddleware, playerAuth, updatePlayerTeam);

module.exports = router;
