const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const { generateResetToken, hashToken, generateToken } = require('../utils/tokenUtils');
const { generateOTP, hashOTP, isValidOTPFormat } = require('../utils/otpUtils');
const { 
  isLockedOut, 
  getLockoutTimeRemaining, 
  recordFailedAttempt, 
  resetAttempts 
} = require('../utils/otpTracking');
const { sendEmail } = require('../utils/unifiedEmailService');
const config = require('../config/server.config');
const { 
  logFailedLogin, 
  logSuccessfulLogin, 
  logCompetitionSelection 
} = require('../middleware/securityLogger');
const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Forgot Password Controller (OTP-based)
 * Generates and sends a 6-digit OTP via email
 * 
 * @route POST /api/auth/forgot-password
 * @access Public
 */
async function forgotPassword(req, res) {
  const startTime = Date.now();
  console.log('🔐 Forgot password request started (OTP-based)');
  
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

    // If user exists, generate OTP and send email
    if (user) {
      console.log('🔑 Generating OTP...');
      
      // Generate 6-digit OTP
      const otp = generateOTP();
      // console.log('📱 OTP generated:', otp); // SECURITY: Removed for production

      // Hash OTP with SHA-256 before storing
      const hashedOTP = hashOTP(otp);

      // Set OTP expiry to 10 minutes from current time
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000);

      // Store hashed OTP and expiry in user document
      user.resetPasswordToken = hashedOTP;
      user.resetPasswordExpires = expiryTime;
      await user.save();

      console.log('💾 OTP saved to database');

      // Prepare email content
      const emailSubject = 'Password Reset OTP - Mallakhamb Competition';
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
              Use the OTP code below to proceed with resetting your password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #f3f4f6; border: 2px dashed #2563eb; border-radius: 8px; 
                          padding: 20px; display: inline-block;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0; font-weight: 500;">
                  Your OTP Code:
                </p>
                <p style="font-size: 36px; font-weight: bold; color: #2563eb; margin: 0; 
                          letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${otp}
                </p>
              </div>
            </div>
            
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 5px; 
                        padding: 15px; margin: 20px 0;">
              <p style="color: #92400e; font-weight: bold; margin: 0 0 10px 0; font-size: 14px;">
                ⚠️ Important Security Information:
              </p>
              <ul style="color: #92400e; font-size: 14px; margin: 0; padding-left: 20px;">
                <li>This OTP will expire in <strong>10 minutes</strong></li>
                <li>You have <strong>3 attempts</strong> to enter the correct OTP</li>
                <li>Never share this OTP with anyone</li>
                <li>Our team will never ask for your OTP</li>
              </ul>
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
      
      // Send email with OTP
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
      message: 'If an account with that email exists, an OTP has been sent to your email.',
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
 * Verify OTP Controller
 * Validates the OTP provided by the user
 * 
 * @route POST /api/auth/verify-otp
 * @access Public
 */
async function verifyOTP(req, res) {
  try {
    const { email, otp } = req.body;

    // Validate inputs
    if (!email || !otp) {
      return res.status(400).json({
        message: 'Email and OTP are required'
      });
    }

    // Validate OTP format
    if (!isValidOTPFormat(otp)) {
      return res.status(400).json({
        message: 'Invalid OTP format. OTP must be 6 digits.'
      });
    }

    // Check if email is locked out
    if (isLockedOut(email)) {
      const remainingSeconds = getLockoutTimeRemaining(email);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      
      return res.status(429).json({
        message: `Too many failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        lockedOut: true,
        remainingSeconds
      });
    }

    console.log('🔍 Verifying OTP for email:', email.toLowerCase());

    // Search for user
    let user = await Player.findOne({ email: email.toLowerCase() });
    let userType = 'player';

    if (!user) {
      user = await Coach.findOne({ email: email.toLowerCase() });
      userType = 'coach';
    }

    // If user not found, record failed attempt (to prevent email enumeration timing attacks)
    if (!user) {
      const result = recordFailedAttempt(email);
      return res.status(400).json({
        message: 'Invalid OTP or OTP has expired.',
        attemptsRemaining: result.attemptsRemaining
      });
    }

    // Check if OTP exists and hasn't expired
    if (!user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({
        message: 'No OTP found. Please request a new password reset.'
      });
    }

    // Check if OTP has expired
    if (Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({
        message: 'OTP has expired. Please request a new password reset.'
      });
    }

    // Hash the provided OTP and compare with stored hash
    const hashedOTP = hashOTP(otp);
    
    if (hashedOTP !== user.resetPasswordToken) {
      // OTP doesn't match - record failed attempt
      const result = recordFailedAttempt(email);
      
      console.log(`❌ Invalid OTP attempt for ${email}`);
      
      if (result.locked) {
        return res.status(429).json({
          message: `Too many failed attempts. Account locked for ${Math.ceil(result.lockoutSeconds / 60)} minutes.`,
          lockedOut: true,
          remainingSeconds: result.lockoutSeconds
        });
      }
      
      return res.status(400).json({
        message: `Invalid OTP. ${result.attemptsRemaining} attempt(s) remaining.`,
        attemptsRemaining: result.attemptsRemaining
      });
    }

    // OTP is valid - reset attempts
    resetAttempts(email);
    
    console.log(`✅ OTP verified successfully for ${email}`);

    // Return success (don't clear OTP yet - wait for password reset)
    return res.status(200).json({
      message: 'OTP verified successfully. You can now reset your password.',
      verified: true
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      message: 'An error occurred. Please try again later.'
    });
  }
}

/**
 * Reset Password with OTP Controller
 * Resets password after OTP verification
 * 
 * @route POST /api/auth/reset-password-otp
 * @access Public
 */
async function resetPasswordWithOTP(req, res) {
  try {
    const { email, otp, password } = req.body;

    // Validate inputs
    if (!email || !otp || !password) {
      return res.status(400).json({
        message: 'Email, OTP, and new password are required'
      });
    }

    // Validate OTP format
    if (!isValidOTPFormat(otp)) {
      return res.status(400).json({
        message: 'Invalid OTP format. OTP must be 6 digits.'
      });
    }

    // Validate password strength
    const { validatePassword } = require('../utils/passwordValidation');
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordCheck.errors 
      });
    }

    // Check if email is locked out
    if (isLockedOut(email)) {
      const remainingSeconds = getLockoutTimeRemaining(email);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      
      return res.status(429).json({
        message: `Too many failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        lockedOut: true
      });
    }

    console.log('🔐 Resetting password with OTP for:', email.toLowerCase());

    // Search for user
    let user = await Player.findOne({ email: email.toLowerCase() });
    let userType = 'player';

    if (!user) {
      user = await Coach.findOne({ email: email.toLowerCase() });
      userType = 'coach';
    }

    // If user not found
    if (!user) {
      recordFailedAttempt(email);
      return res.status(400).json({
        message: 'Invalid OTP or OTP has expired.'
      });
    }

    // Check if OTP exists and hasn't expired
    if (!user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({
        message: 'No OTP found. Please request a new password reset.'
      });
    }

    // Check if OTP has expired
    if (Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({
        message: 'OTP has expired. Please request a new password reset.'
      });
    }

    // Hash the provided OTP and compare with stored hash
    const hashedOTP = hashOTP(otp);
    
    if (hashedOTP !== user.resetPasswordToken) {
      // OTP doesn't match - record failed attempt
      const result = recordFailedAttempt(email);
      
      console.log(`❌ Invalid OTP attempt during password reset for ${email}`);
      
      if (result.locked) {
        return res.status(429).json({
          message: `Too many failed attempts. Account locked for ${Math.ceil(result.lockoutSeconds / 60)} minutes.`,
          lockedOut: true
        });
      }
      
      return res.status(400).json({
        message: `Invalid OTP. ${result.attemptsRemaining} attempt(s) remaining.`,
        attemptsRemaining: result.attemptsRemaining
      });
    }

    // OTP is valid - reset password
    resetAttempts(email);
    
    // Update user password (bcrypt hashing will be handled by pre-save hook)
    user.password = password;
    
    // Clear resetPasswordToken and resetPasswordExpires fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Save user (this will trigger the pre-save hook to hash the password)
    await user.save();

    console.log(`✅ Password reset successfully for ${email}`);

    // Return success message
    return res.status(200).json({
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password with OTP error:', error);
    return res.status(500).json({
      message: 'An error occurred. Please try again later.'
    });
  }
}

/**
 * Reset Password Controller (Legacy - URL Token based)
 * Handles password reset with token validation
 * Kept for backward compatibility
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

    // Validate password strength
    const { validatePassword } = require('../utils/passwordValidation');
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordCheck.errors 
      });
    }

    // Hash the provided token with SHA-256
    const hashedToken = hashToken(token);
    
    // Check if token has already been used
    const { isTokenUsed, markTokenAsUsed } = require('../utils/passwordResetTracking');
    if (isTokenUsed(hashedToken)) {
      return res.status(400).json({
        message: 'Password reset token has already been used. Please request a new password reset.'
      });
    }

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

    // Mark token as used BEFORE saving to prevent race conditions
    markTokenAsUsed(hashedToken);

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

/**
 * Set Competition Context
 * Validates user access to competition and issues new JWT with competition context
 * 
 * @route POST /api/auth/set-competition
 * @access Protected (requires authentication)
 */
async function setCompetition(req, res) {
  try {
    const { competitionId } = req.body;
    const userId = req.user._id;
    const userType = req.userType;

    // Validate competition ID is provided
    if (!competitionId) {
      return res.status(400).json({
        message: 'Competition ID is required'
      });
    }

    // Validate competition ID format
    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: 'Invalid Competition ID',
        message: 'Competition ID must be a valid ObjectId',
        value: competitionId
      });
    }

    // Verify competition exists and is not deleted
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({
        error: 'Competition Not Found',
        message: 'The specified competition does not exist or has been deleted',
        competitionId
      });
    }

    // Check if competition is marked as deleted (soft delete)
    if (competition.isDeleted) {
      return res.status(403).json({
        error: 'Competition Deleted',
        message: 'This competition has been deleted and is no longer accessible',
        competitionId
      });
    }

    // Validate user has access to this competition
    // Super admins have access to all competitions
    if (userType === 'superadmin' || req.user.role === 'super_admin') {
      // Super admin can access any competition
    } else if (userType === 'admin') {
      // Regular admins must be assigned to the competition
      if (!req.user.hasAccessToCompetition(competitionId)) {
        return res.status(403).json({
          error: 'Access Denied',
          message: 'You do not have access to this competition',
          competitionId
        });
      }
    } else if (userType === 'coach') {
      // Coaches can select any competition
      // They can have multiple teams across different competitions
      // Just validate that the competition exists (already done above)
      // The coach will either:
      // 1. Already have a team for this competition (can access dashboard)
      // 2. Need to create a new team for this competition (dashboard will show "no team" message)
      
      // No automatic team mapping needed here - coaches manage their teams explicitly
      // through the team creation and registration flow
    } else if (userType === 'player') {
      // Players can select any competition (they will join teams for it)
      // No validation needed here
    } else if (userType === 'judge') {
      // Judges must be assigned to the competition
      // This will be validated when judge model is updated
      // For now, allow any competition
    }

    // Generate new JWT token with competition context
    const token = generateToken(userId, userType, competitionId);

    // Log competition selection
    logCompetitionSelection(userId, userType, competitionId, req);

    return res.status(200).json({
      message: 'Competition context set successfully',
      token,
      competition: {
        id: competition._id,
        name: competition.name,
        level: competition.level,
        place: competition.place,
        status: competition.status,
        startDate: competition.startDate,
        endDate: competition.endDate
      }
    });
  } catch (error) {
    console.error('Set competition error:', error);
    return res.status(500).json({
      message: 'An error occurred while setting competition context'
    });
  }
}

/**
 * Get Assigned Competitions
 * Returns list of competitions assigned to the current user
 * 
 * @route GET /api/auth/competitions/assigned
 * @access Protected (requires authentication)
 */
async function getAssignedCompetitions(req, res) {
  try {
    const userId = req.user._id;
    const userType = req.userType;

    let competitions = [];

    if (userType === 'superadmin' || req.user.role === 'super_admin') {
      // Super admins can access all competitions
      competitions = await Competition.find({})
        .select('name level place status startDate endDate description ageGroups competitionTypes')
        .sort({ startDate: -1 });
    } else if (userType === 'admin') {
      // Regular admins see only their assigned competitions
      await req.user.populate('competitions');
      competitions = req.user.competitions.map(comp => ({
        _id: comp._id,
        name: comp.name,
        level: comp.level,
        place: comp.place,
        status: comp.status,
        startDate: comp.startDate,
        endDate: comp.endDate,
        description: comp.description,
        ageGroups: comp.ageGroups || [],
        competitionTypes: comp.competitionTypes || []
      }));
    } else if (userType === 'coach') {
      // Coaches: show only competitions where this coach has at least one team registered
      competitions = await Competition.find({
        'registeredTeams.coach': userId
      })
        .select('name level place status startDate endDate description ageGroups competitionTypes')
        .sort({ startDate: -1 });
    } else if (userType === 'player') {
      // Players: show only competitions where they are registered in a team
      competitions = await Competition.find({
        'registeredTeams.players.player': userId
      })
        .select('name level place status startDate endDate description ageGroups competitionTypes')
        .sort({ startDate: -1 });
    } else if (userType === 'judge') {
      // Judges see competitions they are assigned to
      // This will be implemented when judge model is updated with competition reference
      // For now, return all competitions
      competitions = await Competition.find({})
        .select('name level place status startDate endDate description ageGroups competitionTypes')
        .sort({ startDate: -1 });
    }

    return res.status(200).json({
      competitions,
      count: competitions.length
    });
  } catch (error) {
    console.error('Get assigned competitions error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching competitions'
    });
  }
}

/**
 * Logout Controller
 * Clears competition context and provides logout confirmation
 * Note: JWT tokens are stateless, so actual token invalidation happens client-side
 * 
 * @route POST /api/auth/logout
 * @access Protected (requires authentication)
 */
async function logout(req, res) {
  try {
    const userId = req.user._id;
    const userType = req.userType;
    const { recordLogout } = require('../utils/tokenInvalidation');

    console.log(`🚪 User logout: ${userId} (${userType})`);

    // Record logout to invalidate current token
    recordLogout(userId);

    return res.status(200).json({
      message: 'Logout successful',
      notice: 'Please select a competition again on your next login'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      message: 'An error occurred during logout'
    });
  }
}

module.exports = {
  forgotPassword,
  verifyOTP,
  resetPasswordWithOTP,
  resetPassword,
  setCompetition,
  getAssignedCompetitions,
  logout
};
