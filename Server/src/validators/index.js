/**
 * Validators Index
 * 
 * Central export point for all validation middleware.
 * Import validators from this file for cleaner imports.
 * 
 * Example usage:
 * const { authValidator, playerValidator } = require('./validators');
 * router.post('/login', authValidator.login(), validate, authController.login);
 */

const authValidator = require('./auth.validator');
const playerValidator = require('./player.validator');
const coachValidator = require('./coach.validator');
const competitionValidator = require('./competition.validator');
const teamValidator = require('./team.validator');
const scoringValidator = require('./scoring.validator');
const commonValidator = require('./common.validator');

module.exports = {
  authValidator,
  playerValidator,
  coachValidator,
  competitionValidator,
  teamValidator,
  scoringValidator,
  commonValidator
};
