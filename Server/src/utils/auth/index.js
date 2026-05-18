/**
 * Auth Utilities — barrel export
 *
 * Groups OTP, token, and password utilities under a single import point.
 *
 * Usage:
 *   const { generateOTP, generateToken, validatePassword } = require('../utils/auth');
 */

const otpUtil = require('./otp.util');
const tokenUtil = require('./token.util');
const passwordUtil = require('./password.util');

module.exports = {
  ...otpUtil,
  ...tokenUtil,
  ...passwordUtil,
};
