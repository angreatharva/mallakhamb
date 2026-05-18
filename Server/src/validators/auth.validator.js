const { body } = require('express-validator');
const { email, password, enumValue } = require('./common.validator');

/**
 * Validation rules for authentication endpoints
 */

/**
 * Validate login request
 */
const login = () => {
  return [
    email('email'),
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required'),
    enumValue('userType', ['player', 'coach', 'admin', 'judge'])
  ];
};

/**
 * Validate player registration
 */
const registerPlayer = () => {
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
    email('email'),
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
    enumValue('gender', ['Male', 'Female'])
  ];
};

/**
 * Validate coach registration
 */
const registerCoach = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    email('email'),
    password('password')
  ];
};

/**
 * Validate admin registration
 */
const registerAdmin = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    email('email'),
    password('password'),
    body('role')
      .optional()
      .trim()
      .isIn(['admin', 'super_admin'])
      .withMessage('Role must be either admin or super_admin')
  ];
};

/**
 * Validate forgot password request
 */
const forgotPassword = () => {
  return [
    email('email')
  ];
};

/**
 * Validate OTP verification
 */
const verifyOTP = () => {
  return [
    email('email'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers')
  ];
};

/**
 * Validate password reset with OTP
 */
const resetPassword = () => {
  return [
    email('email'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
    password('newPassword')
  ];
};

/**
 * Validate change password request
 */
const changePassword = () => {
  return [
    body('currentPassword')
      .trim()
      .notEmpty()
      .withMessage('Current password is required'),
    password('newPassword'),
    body('confirmPassword')
      .trim()
      .notEmpty()
      .withMessage('Confirm password is required')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Passwords do not match');
        }
        return true;
      })
  ];
};

module.exports = {
  login,
  registerPlayer,
  registerCoach,
  registerAdmin,
  forgotPassword,
  verifyOTP,
  resetPassword,
  changePassword
};
