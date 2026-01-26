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
  const startTime = Date.now();
  console.log('🔐 Forgot password request started');
  
  try {
    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      console.log('❌ No email provided');
      return res.status(400).json({
        message: 'Email is required'
      });
    }

    console.log('🔍 Searching for user with email:', email.toLowerCase());

    // Search for user in Player collection first, then Coach collection
    let user = await Player.findOne({ email: email.toLowerCase() });
    let userType = 'player';

    if (!user) {
      user = await Coach.findOne({ email: email.toLowerCase() });
      userType = 'coach';
    }

    console.log('👤 User found:', user ? `Yes (${userType})` : 'No');

    // If user exists, generate token and send email
    if (user) {
      console.log('🔑 Generating reset token...');
      
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

      console.log('💾 Token saved to database');

      // Build reset link with raw token using dynamic frontend URL
      const frontendUrl = config.getFrontendUrl();
      const resetLink = `${frontendUrl}/reset-password/${rawToken}`;

      console.log('🔗 Password reset link generated:', resetLink);

      // Prepare email content
      const emailSubject = 'Password Reset Request - Mallakhamb Competition';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">Mallakhamb Competition</h1>
              <h2 style="color: #374151; margin: 10px 0;">Password Reset Request</h2>
            </div>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Hello,
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              You requested to reset your password for your Mallakhamb Competition account. 
              Click the button below to proceed with resetting your password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="display: inline-block; padding: 15px 30px; background-color: #2563eb; 
                        color: white; text-decoration: none; border-radius: 8px; font-weight: bold;
                        font-size: 16px;">
                Reset My Password
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link into your browser:
            </p>
            <p style="word-break: break-all; color: #2563eb; font-size: 14px; background-color: #f3f4f6; 
                      padding: 10px; border-radius: 5px;">
              ${resetLink}
            </p>
            
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 5px; 
                        padding: 15px; margin: 20px 0;">
              <p style="color: #92400e; font-weight: bold; margin: 0; font-size: 14px;">
                ⚠️ Important: This link will expire in 15 minutes for security reasons.
              </p>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you didn't request this password reset, please ignore this email. 
              Your password will remain unchanged.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              This email was sent from the Mallakhamb Competition system. 
              Please do not reply to this email.
            </p>
          </div>
        </div>
      `;

      console.log('📧 Attempting to send email...');
      
      // Send email with reset link
      const emailSent = await sendEmail(email, emailSubject, emailHtml);
      
      if (emailSent) {
        console.log('✅ Email sent successfully');
      } else {
        console.log('❌ Email failed to send');
        // Don't return error to user for security, but log it
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🔐 Forgot password request completed in ${duration}ms`);

    // Return same success message regardless of email existence (security best practice)
    // This prevents attackers from determining which emails are registered
    return res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      success: true
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    // Log error with details for debugging
    console.error(`❌ Forgot password error after ${duration}ms:`, error);

    // Return generic error message to user (don't expose system details)
    return res.status(500).json({
      message: 'An error occurred. Please try again later.',
      success: false
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
