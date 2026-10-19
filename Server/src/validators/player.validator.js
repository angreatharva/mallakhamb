const { body } = require('express-validator');
const { objectId, password, phone, enumValue, date } = require('./common.validator');
const { AGE_GROUPS, GENDERS } = require('../config/cop-rules');

const EMAIL_TYPES = ['self', 'guardian', 'none'];

/** Below this age a guardian has to consent to the registration (DPDP Act). */
const CONSENT_AGE = 18;

/** Whole years from a date of birth to now. */
const ageOn = (dateOfBirth, now = new Date()) => {
  const born = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth()
    || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  return beforeBirthday ? age - 1 : age;
};

/** The first-screen choice; absent means "my own email", as before it existed. */
/** The digit-count rule of common.validator's phone(), for chains that need an .if() first. */
const phoneDigits = (value) => {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Phone number must contain between 10 and 15 digits');
  }
  return true;
};

const emailTypeOfBody = (req) => req.body.emailType || 'self';
const needsGuardian = (value, { req }) => emailTypeOfBody(req) !== 'self';

/**
 * The responsible adult, required when the player is not using their own
 * address. Escaped like the player's own names.
 */
const guardianFields = () => [
  body('guardian.name')
    .if(needsGuardian)
    .trim()
    .notEmpty()
    .withMessage('Parent/guardian name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Parent/guardian name must be between 2 and 100 characters')
    .escape(),
  body('guardian.relation')
    .if(needsGuardian)
    .trim()
    .notEmpty()
    .withMessage('Relation to the player is required')
    .isLength({ max: 40 })
    .withMessage('Relation must be at most 40 characters')
    .escape(),
  body('guardian.phone')
    .if(needsGuardian)
    .trim()
    .notEmpty()
    .withMessage('Parent/guardian phone number is required')
    .custom(phoneDigits),
];

/**
 * Validation rules for player endpoints
 */

/**
 * Validate create player request
 */
const createPlayer = () => {
  return [
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .escape(),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .escape(),
    body('emailType')
      .optional()
      .isIn(EMAIL_TYPES)
      .withMessage(`emailType must be one of: ${EMAIL_TYPES.join(', ')}`),
    // The player's own or a guardian's — required either way, and dropped by
    // the service for a player who has none.
    body('email')
      .if((value, { req }) => emailTypeOfBody(req) !== 'none')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .toLowerCase(),
    // A player using a guardian's address is usually too young for a phone of
    // their own; the guardian's number is the contact then.
    body('phone')
      .if((value, { req }) => emailTypeOfBody(req) === 'self' || Boolean(value))
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .custom(phoneDigits),
    ...guardianFields(),
    body('guardianConsent')
      .custom((value, { req }) => {
        const born = req.body.dateOfBirth;
        if (!born || Number.isNaN(new Date(born).getTime())) return true; // reported by dateOfBirth
        if (ageOn(born) < CONSENT_AGE && !(value === true || value === 'true')) {
          throw new Error('A parent or guardian must consent to registering a player under 18');
        }
        return true;
      }),
    body('dateOfBirth')
      .trim()
      .notEmpty()
      .withMessage('Date of birth is required')
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .toDate()
      .custom((value) => {
        const age = Math.floor((new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 5 || age > 100) {
          throw new Error('Age must be between 5 and 100 years');
        }
        return true;
      }),
    password('password'),
    enumValue('gender', GENDERS),
    body('ageGroup')
      .optional()
      .trim()
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    body('team')
      .optional()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid team ID format');
          }
        }
        return true;
      })
  ];
};

/**
 * Validate update player request
 */
const updatePlayer = () => {
  return [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .escape(),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .escape(),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .toLowerCase(),
    // Optional here so the accounts that predate the schema field can have a
    // number filled in later, without every other update carrying one.
    phone('phone', { isOptional: true }),
    body('dateOfBirth')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .toDate()
      .custom((value) => {
        const age = Math.floor((new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 5 || age > 100) {
          throw new Error('Age must be between 5 and 100 years');
        }
        return true;
      }),
    body('gender')
      .optional()
      .trim()
      .isIn(GENDERS)
      .withMessage('Gender must be Male or Female'),
    body('ageGroup')
      .optional()
      .trim()
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    body('team')
      .optional()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid team ID format');
          }
        }
        return true;
      }),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
      .toBoolean()
  ];
};

/**
 * Validate get player by ID
 */
const getPlayerById = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate delete player
 */
const deletePlayer = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate assign team to player
 */
const assignTeam = () => {
  return [
    objectId('playerId', 'param'),
    body('teamId')
      .trim()
      .notEmpty()
      .withMessage('Team ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      })
  ];
};

/**
 * Validate join team request (for player joining a team in a competition)
 */
const joinTeam = () => {
  return [
    body('teamId')
      .trim()
      .notEmpty()
      .withMessage('Team ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      }),
    body('competitionId')
      .optional() // Make competitionId optional for now
      .trim()
      .custom((value) => {
        if (value) { // Only validate if provided
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid competition ID format');
          }
        }
        return true;
      })
  ];
};

module.exports = {
  createPlayer,
  updatePlayer,
  getPlayerById,
  deletePlayer,
  assignTeam,
  joinTeam
};
