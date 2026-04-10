/**
 * User Service (Base Class)
 * 
 * Base service for common user operations across all user types.
 * Provides profile management, password changes, and account activation.
 * 
 * Requirements: 1.5, 1.8
 */

const bcrypt = require('bcryptjs');
const { 
  NotFoundError, 
  ValidationError,
  AuthenticationError,
  ConflictError 
} = require('../../errors');

class UserService {
  /**
   * Create a user service
   * @param {BaseRepository} repository - User repository (Player, Coach, or Admin)
   * @param {Logger} logger - Logger instance
   * @param {string} userType - User type identifier (player, coach, admin)
   */
  constructor(repository, logger, userType) {
    this.repository = repository;
    this.logger = logger;
    this.userType = userType;
  }

  /**
   * Get user profile by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User profile without password
   * @throws {NotFoundError} If user not found
   */
  async getProfile(userId) {
    try {
      const user = await this.repository.findById(userId);

      if (!user) {
        this.logger.warn('Get profile failed: User not found', { 
          userId, 
          userType: this.userType 
        });
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = user;

      this.logger.info('Profile retrieved', { 
        userId, 
        userType: this.userType 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get profile error', { 
        userId, 
        userType: this.userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Profile updates
   * @returns {Promise<Object>} Updated profile without password
   * @throws {NotFoundError} If user not found
   * @throws {ConflictError} If email already taken
   */
  async updateProfile(userId, updates) {
    try {
      // Check if user exists
      const user = await this.repository.findById(userId);

      if (!user) {
        this.logger.warn('Update profile failed: User not found', { 
          userId, 
          userType: this.userType 
        });
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Prevent updating sensitive fields
      const { password, resetPasswordToken, resetPasswordExpires, ...allowedUpdates } = updates;

      // If email is being updated, check if it's already taken
      if (allowedUpdates.email && allowedUpdates.email !== user.email) {
        const normalizedEmail = allowedUpdates.email.toLowerCase();
        const emailTaken = await this.repository.isEmailTaken(normalizedEmail, userId);

        if (emailTaken) {
          this.logger.warn('Update profile failed: Email already taken', { 
            userId, 
            email: normalizedEmail, 
            userType: this.userType 
          });
          throw new ConflictError('Email already registered');
        }

        allowedUpdates.email = normalizedEmail;
      }

      // Update user
      const updatedUser = await this.repository.updateById(userId, allowedUpdates);

      if (!updatedUser) {
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Remove password from response
      const { password: _, resetPasswordToken: __, resetPasswordExpires: ___, ...profile } = updatedUser;

      this.logger.info('Profile updated', { 
        userId, 
        userType: this.userType,
        updatedFields: Object.keys(allowedUpdates)
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        throw error;
      }
      this.logger.error('Update profile error', { 
        userId, 
        userType: this.userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   * @throws {NotFoundError} If user not found
   * @throws {AuthenticationError} If current password is invalid
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user with password
      const user = await this.repository.findById(userId);

      if (!user) {
        this.logger.warn('Change password failed: User not found', { 
          userId, 
          userType: this.userType 
        });
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) {
        this.logger.warn('Change password failed: Invalid current password', { 
          userId, 
          userType: this.userType 
        });
        throw new AuthenticationError('Current password is incorrect');
      }

      // Validate new password
      if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters');
      }

      // Update password (will be hashed by model pre-save hook)
      await this.repository.updateById(userId, {
        password: newPassword
      });

      this.logger.info('Password changed', { 
        userId, 
        userType: this.userType 
      });
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof AuthenticationError || 
          error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Change password error', { 
        userId, 
        userType: this.userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Activate user account
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated profile
   * @throws {NotFoundError} If user not found
   */
  async activateAccount(userId) {
    try {
      const user = await this.repository.findById(userId);

      if (!user) {
        this.logger.warn('Activate account failed: User not found', { 
          userId, 
          userType: this.userType 
        });
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Update isActive to true
      const updatedUser = await this.repository.updateById(userId, {
        isActive: true
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedUser;

      this.logger.info('Account activated', { 
        userId, 
        userType: this.userType 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Activate account error', { 
        userId, 
        userType: this.userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Deactivate user account
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated profile
   * @throws {NotFoundError} If user not found
   */
  async deactivateAccount(userId) {
    try {
      const user = await this.repository.findById(userId);

      if (!user) {
        this.logger.warn('Deactivate account failed: User not found', { 
          userId, 
          userType: this.userType 
        });
        throw new NotFoundError(`${this.userType} not found`);
      }

      // Update isActive to false
      const updatedUser = await this.repository.updateById(userId, {
        isActive: false
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedUser;

      this.logger.info('Account deactivated', { 
        userId, 
        userType: this.userType 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Deactivate account error', { 
        userId, 
        userType: this.userType, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = UserService;
