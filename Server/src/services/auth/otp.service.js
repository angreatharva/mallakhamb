/**
 * OTP Service
 * 
 * Handles OTP generation, validation, and email sending.
 * Integrates with email service and tracks OTP attempts and expiration.
 * 
 * Requirements: 1.5, 1.8
 */

const crypto = require('crypto');
const { ValidationError } = require('../../errors');

class OTPService {
  /**
   * Create an OTP service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {AdminRepository} adminRepository - Admin repository
   * @param {EmailService} emailService - Email service instance (optional)
   */
  constructor(configManager, logger, playerRepository, coachRepository, adminRepository, emailService = null) {
    this.config = configManager;
    this.logger = logger;
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.emailService = emailService;
  }

  /**
   * Generate OTP code
   * @returns {string} OTP code
   */
  generateOTPCode() {
    const otpLength = this.config.get('security.otpLength');
    const max = Math.pow(10, otpLength) - 1;
    const min = Math.pow(10, otpLength - 1);
    
    const otp = Math.floor(Math.random() * (max - min + 1)) + min;
    return otp.toString();
  }

  /**
   * Generate and send OTP to user
   * @param {Object} user - User object
   * @param {string} userType - User type (player, coach, admin)
   * @returns {Promise<void>}
   */
  async generateAndSendOTP(user, userType) {
    try {
      // Generate OTP
      const otp = this.generateOTPCode();
      
      // Calculate expiration time
      const otpExpiryMinutes = this.config.get('security.otpExpiry');
      const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

      // Get repository for user type
      const repository = this.getRepositoryByType(userType);

      // Store OTP in user document
      await repository.updateById(user._id, {
        resetPasswordToken: otp,
        resetPasswordExpires: expiresAt
      });

      // Send OTP via email service if available
      if (this.emailService) {
        try {
          await this.emailService.sendOTP(user.email || user.username, {
            otp,
            userName: user.name || user.username || 'User',
            expiryMinutes: otpExpiryMinutes
          });
          
          this.logger.info('OTP sent via email', { 
            userId: user._id, 
            userType,
            email: user.email || user.username
          });
        } catch (emailError) {
          this.logger.error('Failed to send OTP email', {
            userId: user._id,
            userType,
            error: emailError.message
          });
          // Don't fail the OTP generation if email fails
        }
      } else {
        // Log OTP in development mode if email service not available
        if (this.config.get('server.nodeEnv') === 'development') {
          this.logger.info('OTP generated (DEV MODE - no email service)', { 
            userId: user._id, 
            userType, 
            otp,
            email: user.email || user.username
          });
        }
      }

      this.logger.info('OTP generated and sent', { 
        userId: user._id, 
        userType,
        email: user.email || user.username
      });
    } catch (error) {
      this.logger.error('OTP generation failed', { 
        userId: user._id, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Verify OTP for user
   * @param {Object} user - User object
   * @param {string} otp - OTP code to verify
   * @param {string} userType - User type (player, coach, admin)
   * @returns {Promise<boolean>} True if OTP is valid
   * @throws {ValidationError} If OTP is invalid or expired
   */
  async verifyOTP(user, otp, userType) {
    try {
      // Check if OTP exists
      if (!user.resetPasswordToken) {
        this.logger.warn('OTP verification failed: No OTP found', { 
          userId: user._id, 
          userType 
        });
        throw new ValidationError('No OTP found for this user');
      }

      // Check if OTP has expired
      if (!user.resetPasswordExpires || new Date() > new Date(user.resetPasswordExpires)) {
        this.logger.warn('OTP verification failed: OTP expired', { 
          userId: user._id, 
          userType 
        });
        throw new ValidationError('OTP has expired');
      }

      // Verify OTP matches
      if (user.resetPasswordToken !== otp) {
        this.logger.warn('OTP verification failed: Invalid OTP', { 
          userId: user._id, 
          userType 
        });
        throw new ValidationError('Invalid OTP');
      }

      this.logger.info('OTP verified successfully', { 
        userId: user._id, 
        userType 
      });

      return true;
    } catch (error) {
      this.logger.error('OTP verification error', { 
        userId: user._id, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Clear OTP from user document
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<void>}
   */
  async clearOTP(userId, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      
      await repository.updateById(userId, {
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      this.logger.debug('OTP cleared', { userId, userType });
    } catch (error) {
      this.logger.error('OTP clear failed', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get repository by user type
   * @param {string} userType - User type
   * @returns {BaseRepository} Repository instance
   * @throws {Error} If user type is invalid
   */
  getRepositoryByType(userType) {
    switch (userType.toLowerCase()) {
      case 'player':
        return this.playerRepository;
      case 'coach':
        return this.coachRepository;
      case 'admin':
        return this.adminRepository;
      default:
        throw new Error(`Invalid user type: ${userType}`);
    }
  }
}

module.exports = OTPService;
