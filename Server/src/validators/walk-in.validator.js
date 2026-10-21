/**
 * Walk-in desk validators. Coach fields mirror coach self-registration
 * (routes/coach.routes registerValidation) and the default player password
 * mirrors the coach's own profile rule (common.validator password), so the
 * desk cannot create an account the coach's own screens would refuse.
 *
 * Row contents are NOT validated here: an unreadable row is normal while the
 * admin reviews, and services/walk-in/walk-in.service#_check reports what is
 * wrong with each one instead of refusing the whole save.
 *
 * @module validators/walk-in.validator
 */

const { body, query } = require('express-validator');
const { objectId, password, phone } = require('./common.validator');

const draftId = () => [objectId('draftId')];

const findCoach = () => [
  query('q').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Type at least 2 characters'),
  query('email').if(query('q').not().exists()).trim().isEmail().withMessage("Enter the coach's email address").toLowerCase(),
];

const createCoach = () => [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 50 }).escape(),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 50 }).escape(),
  body('email').trim().isEmail().withMessage('Valid email is required').toLowerCase(),
  phone('phone'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  password('playerDefaultPassword'),
];

const setDefaultPassword = () => [
  objectId('coachId'),
  password('playerDefaultPassword'),
  phone('phone', { isOptional: true }),
];

const ensureTeam = () => [
  objectId('coachId'),
  body('name').trim().notEmpty().withMessage('Team name is required').isLength({ max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
];

const competitionInQuery = () => [objectId('competitionId', 'query')];
const competitionInParam = () => [objectId('competitionId')];

const openDraft = () => [
  objectId('competitionId', 'body'),
  objectId('coachId', 'body'),
];

const scan = () => [
  ...draftId(),
  query('page').optional().isInt({ min: 1, max: 50 }).withMessage('page must be a page number').toInt(),
];

const saveRows = () => [
  ...draftId(),
  body('rows').isArray({ max: 120 }).withMessage('rows must be a list of at most 120 players'),
  body('rows.*._id').optional({ values: 'null' }).isMongoId(),
  body('rows.*.firstName').optional().isString().isLength({ max: 60 }),
  body('rows.*.lastName').optional().isString().isLength({ max: 60 }),
  body('rows.*.dateOfBirth').optional().isString().isLength({ max: 10 }),
  body('rows.*.gender').optional({ values: 'null' }).isString(),
  body('rows.*.ageGroup').optional({ values: 'null' }).isString(),
  body('rows.*.apparatus').optional().isArray({ max: 3 }),
  body('rows.*.confirmDuplicate').optional().isBoolean().toBoolean(),
  body('rows.*.matchChoice').optional({ values: 'null' }).isIn(['existing', 'new']),
  body('rows.*.matchPlayer').optional({ values: 'null' }).isMongoId(),
  body('guardianConsent').optional().isBoolean().toBoolean(),
];

const verifyPayment = () => [
  ...draftId(),
  body('razorpay_order_id').trim().notEmpty().withMessage('Missing required payment details'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('Missing required payment details'),
  body('razorpay_signature').trim().notEmpty().withMessage('Missing required payment details'),
];

const discount = () => [
  ...draftId(),
  body('discountCode').trim().notEmpty().withMessage('Enter a discount code').isLength({ max: 128 }),
];

module.exports = {
  draftId,
  findCoach,
  createCoach,
  setDefaultPassword,
  ensureTeam,
  competitionInQuery,
  competitionInParam,
  openDraft,
  scan,
  saveRows,
  verifyPayment,
  discount,
};
