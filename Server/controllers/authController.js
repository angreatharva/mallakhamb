const Player = require('../models/Player');
const Coach = require('../models/Coach');
const { generateResetToken, hashToken } = require('../utils/tokenUtils');
const { sendEmail } = require('../utils/emailService');
const config = require('../config/server.config');
require('dotenv').config();

/**
 * Forgot Password Controller
 * Handles password reset token generation and email sending
 * 
 * @route POST /api/auth/forgot-password
 * @access Public
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({
        message: 'Email is required'
      });
    }

    // Search for user in Player collection first, then Coach collection
    let user = await Player.findOne({ email: email.toLowerCase() });
    let userType = 'player';

    if (!user) {
      user = await Coach.findOne({ email: email.toLowerCase() });
      userType = 'coach';
    }

    // If user exists, generate token and send email
    if (user) {
      // Generate secure random token (32 bytes = 64 character hex string)
      const rawToken = generateResetToken();

      // Hash token with SHA-256 before storing
      const hashedToken = hashToken(rawToken);

      // Set token expiry to 15 minutes from current time
      const expiryTime = new Date(Date.now() + 15 * 60 * 1000);

      // Store hashed token and expiry in user document
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = expiryTime;
      await user.save();

      // Build reset link with raw token using dynamic frontend URL
      const frontendUrl = config.getFrontendUrl();
      const resetLink = `${frontendUrl}/reset-password/${rawToken}`;

      console.log('🔗 Password reset link generated:', resetLink);

      // Prepare email content
      const emailSubject = 'Password Reset Request';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the button below to proceed:</p>
          <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; 
             background-color: #007bff; color: white; text-decoration: none; 
             border-radius: 5px; margin: 20px 0;">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #007bff;">${resetLink}</p>
          <p><strong>This link will expire in 15 minutes.</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `;

      // Send email with reset link
      await sendEmail(email, emailSubject, emailHtml);
    }

    // Return same success message regardless of email existence (security best practice)
    // This prevents attackers from determining which emails are registered
    return res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent.'
    });

  } catch (error) {
    // Log error with details for debugging
    console.error('Forgot password error:', error);

    // Return generic error message to user (don't expose system details)
    return res.status(500).json({
      message: 'An error occurred. Please try again later.'
    });
  }
}

/**
 * Reset Password Controller
 * Handles password reset with token validation
 * 
 * @route POST /api/auth/reset-password/:token
 * @access Public
 */
async function resetPassword(req, res) {
  try {
    // Extract token from URL parameter
    const { token } = req.params;
    
    // Extract new password from request body
    const { password } = req.body;

    // Validate inputs
    if (!token) {
      return res.status(400).json({
        message: 'Password reset token is invalid or has expired.'
      });
    }

    if (!password) {
      return res.status(400).json({
        message: 'Password is required'
      });
    }

    // Hash the provided token with SHA-256
    const hashedToken = hashToken(token);

    // Search for user with matching hashed token in Player collection first
    let user = await Player.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() } // Token must not be expired
    });
    
    let userType = 'player';

    // If not found in Player, search in Coach collection
    if (!user) {
      user = await Coach.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      });
      userType = 'coach';
    }

    // If user not found or token expired, return error
    if (!user) {
      return res.status(400).json({
        message: 'Password reset token is invalid or has expired.'
      });
    }

    // Update user password (bcrypt hashing will be handled by pre-save hook)
    user.password = password;
    
    // Clear resetPasswordToken and resetPasswordExpires fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Save user (this will trigger the pre-save hook to hash the password)
    await user.save();

    // Return success message
    return res.status(200).json({
      message: 'Password has been reset successfully.'
    });

  } catch (error) {
    // Log error with details for debugging
    console.error('Reset password error:', error);

    // Return generic error message to user (don't expose system details)
    return res.status(500).json({
      message: 'An error occurred. Please try again later.'
    });
  }
}

module.exports = {
  forgotPassword,
  resetPassword
};
