const { body } = require('express-validator');
const { accountIdentifier, objectId, password } = require('./common.validator');
const { GENDERS } = require('../config/cop-rules');

/**
 * Validation for /api/auth/me — the signed-in user's own account.
 *
 * Every profile field is optional; which ones a role may actually change is
 * AccountService's decision (EDITABLE_FIELDS), so a field another role owns is
 * ignored there rather than refused here.
 */

const phoneDigits = (value) => {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Phone number must contain between 10 and 15 digits');
  }
  return true;
};

const name = (field, label) =>
  body(field)
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage(`${label} must be between 1 and 50 characters`)
    .escape();

const updateMe = () => [
  name('firstName', 'First name'),
  name('lastName', 'Last name'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters').escape(),
  body('phone').optional({ values: 'falsy' }).trim().custom(phoneDigits),
  body('guardian').optional().isObject().withMessage('guardian must be an object'),
  body('guardian.name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).escape(),
  body('guardian.relation').optional({ values: 'falsy' }).trim().isLength({ max: 40 }).escape(),
  body('guardian.phone').optional({ values: 'falsy' }).trim().custom(phoneDigits),
  body('dateOfBirth').optional().isISO8601().withMessage('Date of birth must be a valid date').toDate(),
  body('gender').optional().isIn(GENDERS).withMessage('Gender must be Male or Female'),
  body(['stateUnit', 'registrationNumber', 'certificationLevel']).optional({ values: 'null' }).trim().isLength({ max: 100 }).escape(),
];

const changePassword = () => [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  password('newPassword'),
];

const requestEmailChange = () => [
  body('newEmail')
    .trim()
    .notEmpty()
    .withMessage('New email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .toLowerCase(),
  body('emailType').optional().isIn(['self', 'guardian']).withMessage('emailType must be self or guardian'),
  body('currentPassword').notEmpty().withMessage('Current password is required'),
];

const confirmEmailChange = () => [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Code is required')
    .matches(/^\d{6}$/)
    .withMessage('The code is 6 digits'),
];

/** A coach or super admin deciding one request. */
const decideRequest = () => [objectId('requestId', 'param')];

/** The player's half of a coach-approved reset: Player ID, the code, a new password. */
const completeCoachReset = () => [
  accountIdentifier(),
  body('code').trim().matches(/^\d{6}$/).withMessage('The code is 6 digits'),
  password('password'),
];

module.exports = {
  decideRequest,
  completeCoachReset,
  updateMe,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
};
