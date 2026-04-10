/**
 * Scoring Services Index
 * 
 * Exports all scoring-related services.
 */

const ScoringService = require('./scoring.service');
const CalculationService = require('./calculation.service');

module.exports = {
  ScoringService,
  CalculationService
};
