/**
 * Super Admin "Player teams" request validation.
 * @module validators/player-team-admin.validator
 */

const { body, param, query } = require('express-validator');
const { COMPETITION_LEVELS } = require('../config/competition-levels');

const id = (field, where = param) => where(field).isMongoId().withMessage(`${field} is not a valid id`);
const level = (where = body) => where('level').isIn(COMPETITION_LEVELS).withMessage('Choose a competition level');

module.exports = {
  search: () => [query('q').optional().isString().isLength({ max: 80 })],
  player: () => [id('playerId')],
  correct: () => [
    id('playerId'), level(), id('teamId', body),
    body('reason').isString().trim().isLength({ min: 5, max: 500 }).withMessage('Give a reason (5 to 500 characters)'),
  ],
  removeEntries: () => [id('playerId'), level()],
  resolveConflict: () => [id('conflictId'), id('teamId', body)],
  history: () => [
    query('level').optional().isIn(COMPETITION_LEVELS),
    query('teamId').optional().isMongoId(),
    query('playerId').optional().isMongoId(),
    query('page').optional().isInt({ min: 1, max: 10000 }),
  ],
};
