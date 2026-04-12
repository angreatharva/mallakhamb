/**
 * Authentication Controller (Refactored)
 * 
 * Handles authentication HTTP endpoints by delegating to AuthenticationService.
 * Uses asyncHandler for error handling and validation middleware.
 * Maintains 100% backward compatibility with existing API contracts.
 * 
 * This controller handles:
 * - Password reset (forgot password, verify OTP, reset with OTP)
 * - Competition context management
 * - Logout
 * 
 * Note: Login and registration are handled in separate controllers
 * (playerController, coachController, adminController)
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 19.1, 19.2
 */

const { asyncHandler } = require('../src/middleware/error.middleware');
const container = require('../src/infrastructure/di-container');
const mongoose = require('mongoose');

/**
 * Forgot Password Controller (OTP-based)
 * Generates and sends a 6-digit OTP via email
 * 
 * @route POST /api/auth/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { email } = req.body;

  await authService.forgotPassword(email);

  // Return same success message regardless of email existence (security best practice)
  res.status(200).json({
    message: 'If an account with that email exists, an OTP has been sent to your email.',
    success: true
  });
});

/**
 * Verify OTP Controller
 * Validates the OTP provided by the user
 * 
 * @route POST /api/auth/verify-otp
 * @access Public
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { email, otp } = req.body;

  const verified = await authService.verifyOTP(email, otp);

  res.status(200).json({
    message: 'OTP verified successfully. You can now reset your password.',
    verified
  });
});

/**
 * Reset Password with OTP Controller
 * Resets password after OTP verification
 * 
 * @route POST /api/auth/reset-password-otp
 * @access Public
 */
const resetPasswordWithOTP = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { email, otp, password } = req.body;

  await authService.resetPasswordWithOTP(email, otp, password);

  res.status(200).json({
    message: 'Password has been reset successfully. You can now login with your new password.'
  });
});

/**
 * Reset Password Controller (Legacy - URL Token based)
 * Handles password reset with token validation
 * Kept for backward compatibility
 * 
 * @route POST /api/auth/reset-password/:token
 * @access Public
 * 
 * Note: This is the legacy token-based reset that's still in the original controller
 * It's kept for backward compatibility but the OTP-based flow is preferred
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
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
  const { hashToken } = require('../utils/tokenUtils');
  const hashedToken = hashToken(token);
  
  // Check if token has already been used
  const { isTokenUsed, markTokenAsUsed } = require('../utils/passwordResetTracking');
  if (isTokenUsed(hashedToken)) {
    return res.status(400).json({
      message: 'Password reset token has already been used. Please request a new password reset.'
    });
  }

  // Search for user with matching hashed token in Player collection first
  const Player = require('../models/Player');
  const Coach = require('../models/Coach');
  
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
});

/**
 * Set Competition Context
 * Validates user access to competition and issues new JWT with competition context
 * 
 * @route POST /api/auth/set-competition
 * @access Protected (requires authentication)
 */
const setCompetition = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { competitionId } = req.body;
  const userId = req.user._id.toString();
  const userType = req.userType;

  const result = await authService.setCompetitionContext(userId, userType, competitionId);

  res.status(200).json({
    message: 'Competition context set successfully',
    token: result.token,
    competition: {
      id: result.competition._id,
      name: result.competition.name,
      level: result.competition.level,
      place: result.competition.place,
      status: result.competition.status,
      startDate: result.competition.startDate,
      endDate: result.competition.endDate
    }
  });
});

/**
 * Get Assigned Competitions
 * Returns list of competitions assigned to the current user
 * 
 * @route GET /api/auth/competitions/assigned
 * @access Protected (requires authentication)
 */
const getAssignedCompetitions = asyncHandler(async (req, res) => {
  const competitionRepository = container.resolve('competitionRepository');
  const userId = req.user._id;
  const userType = req.userType;

  let competitions = [];

  if (userType === 'superadmin' || req.user.role === 'super_admin') {
    // Super admins can access all competitions
    competitions = await competitionRepository.find(
      {},
      {
        select: 'name level place status startDate endDate description ageGroups competitionTypes',
        sort: { startDate: -1 }
      }
    );
  } else if (userType === 'admin') {
    // Regular admins see only their assigned competitions
    // This requires the user to have competitions populated
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
    competitions = await competitionRepository.find(
      { 'registeredTeams.coach': userId },
      {
        select: 'name level place status startDate endDate description ageGroups competitionTypes',
        sort: { startDate: -1 }
      }
    );
  } else if (userType === 'player') {
    // Players: show only competitions where they are registered in a team
    competitions = await competitionRepository.find(
      { 'registeredTeams.players.player': userId },
      {
        select: 'name level place status startDate endDate description ageGroups competitionTypes',
        sort: { startDate: -1 }
      }
    );
  } else if (userType === 'judge') {
    // Judges see competitions they are assigned to
    // For now, return all competitions
    competitions = await competitionRepository.find(
      {},
      {
        select: 'name level place status startDate endDate description ageGroups competitionTypes',
        sort: { startDate: -1 }
      }
    );
  }

  res.status(200).json({
    competitions,
    count: competitions.length
  });
});

/**
 * Logout Controller
 * Clears competition context and provides logout confirmation
 * Note: JWT tokens are stateless, so actual token invalidation happens client-side
 * 
 * @route POST /api/auth/logout
 * @access Protected (requires authentication)
 */
const logout = asyncHandler(async (req, res) => {
  const logger = container.resolve('logger');
  const userId = req.user._id;
  const userType = req.userType;

  logger.info('User logout', { userId, userType });

  // Note: Token invalidation would require a token blacklist
  // For now, we just return success and rely on client-side token removal

  res.status(200).json({
    message: 'Logout successful',
    notice: 'Please select a competition again on your next login'
  });
});

module.exports = {
  forgotPassword,
  verifyOTP,
  resetPasswordWithOTP,
  resetPassword,
  setCompetition,
  getAssignedCompetitions,
  logout
};
