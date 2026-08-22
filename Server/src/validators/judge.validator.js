/**
 * Judge Validators
 * 
 * Validation rules for judge endpoints.
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

const { body, param, query } = require('express-validator');
const { email, mongoId, password, phone } = require('./common.validator');

const CERTIFICATION_LEVELS = ['National', 'State', 'District', 'Club'];

/**
 * Validate judge login
 */
const login = () => {
  return [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters'),
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required')
  ];
};

/**
 * Validate judge self-registration.
 *
 * Same rules as the coach registration form (coach.routes.js) so the two
 * cannot tell a user different things about the same password.
 */
const register = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    email('email'),
    phone('phone'),
    password('password'),
    body('stateUnit').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('registrationNumber').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
    body('certificationLevel')
      .optional({ values: 'falsy' })
      .isIn(CERTIFICATION_LEVELS)
      .withMessage(`Certification level must be one of: ${CERTIFICATION_LEVELS.join(', ')}`),
  ];
};

/**
 * Validate profile update.
 *
 * Every field optional — the profile page saves one section at a time. Note
 * there is no `password` rule here on purpose: password changes go through
 * changePassword(), which also demands the current password.
 */
const updateProfile = () => {
  return [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('email').optional().trim().isEmail().withMessage('Please provide a valid email address').toLowerCase(),
    phone('phone', { isOptional: true }),
    body('stateUnit').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
    body('registrationNumber').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
    body('certificationLevel')
      .optional({ values: 'falsy' })
      .isIn(CERTIFICATION_LEVELS)
      .withMessage(`Certification level must be one of: ${CERTIFICATION_LEVELS.join(', ')}`),
    body('photo')
      .optional({ nullable: true })
      .isString()
      .isLength({ max: 400000 })
      .withMessage('Photo must be smaller than 300 KB')
      .custom((value) => {
        if (value && !/^data:image\/(png|jpe?g|webp);base64,/.test(value)) {
          throw new Error('Photo must be a PNG, JPEG or WebP data URL');
        }
        return true;
      }),
  ];
};

/**
 * Validate a self-service password change.
 */
const changePassword = () => {
  return [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    password('newPassword'),
  ];
};

/**
 * Validate set competition context
 */
const setCompetitionContext = () => {
  return [
    mongoId('competitionId', 'param')
      .withMessage('Valid competition ID is required')
  ];
};

/**
 * Validate get competition details
 */
const getCompetitionDetails = () => {
  return [
    mongoId('competitionId', 'param')
      .withMessage('Valid competition ID is required')
  ];
};

/**
 * Validate get available teams
 */
const getAvailableTeams = () => {
  return [
    query('ageGroup')
      .optional()
      .trim()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate get team players
 */
const getTeamPlayers = () => {
  return [
    mongoId('teamId', 'param')
      .withMessage('Valid team ID is required')
  ];
};

/**
 * Validate save individual score
 */
const saveIndividualScore = () => {
  return [
    mongoId('playerId', 'body')
      .withMessage('Valid player ID is required'),
    mongoId('teamId', 'body')
      .withMessage('Valid team ID is required'),
    body('score')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Score must be a number between 0 and 100'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ];
};

/**
 * Validate update individual score
 */
const updateIndividualScore = () => {
  return [
    mongoId('scoreId', 'param')
      .withMessage('Valid score ID is required'),
    body('score')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Score must be a number between 0 and 100'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ];
};

module.exports = {
  login,
  register,
  changePassword,
  updateProfile,
  setCompetitionContext,
  getCompetitionDetails,
  getAvailableTeams,
  getTeamPlayers,
  saveIndividualScore,
  updateIndividualScore
};
