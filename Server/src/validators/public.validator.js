const { param } = require('express-validator');
const { objectId } = require('./common.validator');

const AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];

const getPublicScores = () => [
  objectId('competitionId', 'query'),
];

const getPublicTeams = () => [
  objectId('competitionId', 'query'),
];

const getPublicRankings = () => [
  objectId('competitionId', 'param'),
  param('ageGroup')
    .trim()
    .notEmpty()
    .withMessage('Age group is required')
    .isIn(AGE_GROUPS)
    .withMessage('Invalid age group'),
];

module.exports = {
  getPublicScores,
  getPublicTeams,
  getPublicRankings,
};
