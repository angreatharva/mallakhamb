const { body } = require('express-validator');
const { email, password } = require('./common.validator');

/**
 * Validation rules for the /api/auth endpoints.
 *
 * THESE THREE ARE THE WHOLE SURFACE. auth.routes.js mounts forgot-password,
 * verify-otp and reset-password and nothing else — the per-role register and
 * login endpoints carry their own rules in player.routes.js, coach.routes.js
 * and admin.routes.js.
 *
 * This file used to export five more: login, registerPlayer, registerCoach,
 * registerAdmin and changePassword. None had a caller, and two of them still
 * validated a `name` field that migration 006_split_person_names replaced with
 * firstName/lastName — the same rot that had `coach.validator.js` deleted.
 * Unused validation is worse than none: it reads like the contract while the
 * live rules sit somewhere else and may differ.
 */

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
    password('password')
  ];
};

module.exports = {
  forgotPassword,
  verifyOTP,
  resetPassword,
};
