/**
 * Judge Validators
 * 
 * Validation rules for judge endpoints.
 * 
 * Requirements: 11.1, 11.2, 11.3
 */

const { body, param, query } = require('express-validator');
const { email, mongoId } = require('./common.validator');

/**
 * Validate judge login
 */
const login = () => {
  return [
    email('email'),
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required'),
    mongoId('competitionId', 'body')
      .withMessage('Valid competition ID is required')
  ];
};

/**
 * Validate profile update
 */
const updateProfile = () => {
  return [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .toLowerCase()
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
  updateProfile,
  setCompetitionContext,
  getCompetitionDetails,
  getAvailableTeams,
  getTeamPlayers,
  saveIndividualScore,
  updateIndividualScore
};
