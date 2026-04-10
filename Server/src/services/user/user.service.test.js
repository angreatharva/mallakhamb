/**
 * User Service Unit Tests
 * 
 * Tests for base UserService class.
 * 
 * Requirements: 15.1, 15.6
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, AuthenticationError, ConflictError } = require('../../errors');
const bcrypt = require('bcryptjs');

// Mock bcrypt
jest.mock('bcryptjs');

describe('UserService', () => {
  let userService;
  let mockRepository;
  let mockLogger;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      isEmailTaken: jest.fn()
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create service instance
    userService = new UserService(mockRepository, mockLogger, 'testuser');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile without password', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedpassword',
        resetPasswordToken: 'token',
        resetPasswordExpires: new Date(),
        isActive: true
      };

      mockRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getProfile('user123');

      expect(result).toEqual({
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      });
      expect(result.password).toBeUndefined();
      expect(result.resetPasswordToken).toBeUndefined();
      expect(mockRepository.findById).toHaveBeenCalledWith('user123');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(userService.getProfile('user123')).rejects.toThrow(NotFoundError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedpassword'
      };

      const updates = {
        name: 'Updated Name'
      };

      const updatedUser = {
        ...mockUser,
        name: 'Updated Name'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.updateById.mockResolvedValue(updatedUser);

      const result = await userService.updateProfile('user123', updates);

      expect(result.name).toBe('Updated Name');
      expect(result.password).toBeUndefined();
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', updates);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should prevent updating password field', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedpassword'
      };

      const updates = {
        name: 'Updated Name',
        password: 'newpassword'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.updateById.mockResolvedValue({ ...mockUser, name: 'Updated Name' });

      await userService.updateProfile('user123', updates);

      // Password should not be in the updates passed to repository
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', {
        name: 'Updated Name'
      });
    });

    it('should check email availability when updating email', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'old@example.com',
        name: 'Test User'
      };

      const updates = {
        email: 'new@example.com'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.isEmailTaken.mockResolvedValue(false);
      mockRepository.updateById.mockResolvedValue({ ...mockUser, email: 'new@example.com' });

      await userService.updateProfile('user123', updates);

      expect(mockRepository.isEmailTaken).toHaveBeenCalledWith('new@example.com', 'user123');
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', {
        email: 'new@example.com'
      });
    });

    it('should throw ConflictError if email already taken', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'old@example.com'
      };

      const updates = {
        email: 'taken@example.com'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.isEmailTaken.mockResolvedValue(true);

      await expect(userService.updateProfile('user123', updates)).rejects.toThrow(ConflictError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(userService.updateProfile('user123', {})).rejects.toThrow(NotFoundError);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedoldpassword'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      mockRepository.updateById.mockResolvedValue(mockUser);

      await userService.changePassword('user123', 'oldpassword', 'newpassword123');

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpassword', 'hashedoldpassword');
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', {
        password: 'newpassword123'
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw AuthenticationError if current password is invalid', async () => {
      const mockUser = {
        _id: 'user123',
        password: 'hashedoldpassword'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        userService.changePassword('user123', 'wrongpassword', 'newpassword123')
      ).rejects.toThrow(AuthenticationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw ValidationError if new password is too short', async () => {
      const mockUser = {
        _id: 'user123',
        password: 'hashedoldpassword'
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      await expect(
        userService.changePassword('user123', 'oldpassword', 'short')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        userService.changePassword('user123', 'oldpassword', 'newpassword123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('activateAccount', () => {
    it('should activate user account successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isActive: false,
        password: 'hashedpassword'
      };

      const activatedUser = {
        ...mockUser,
        isActive: true
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.updateById.mockResolvedValue(activatedUser);

      const result = await userService.activateAccount('user123');

      expect(result.isActive).toBe(true);
      expect(result.password).toBeUndefined();
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', {
        isActive: true
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(userService.activateAccount('user123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate user account successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isActive: true,
        password: 'hashedpassword'
      };

      const deactivatedUser = {
        ...mockUser,
        isActive: false
      };

      mockRepository.findById.mockResolvedValue(mockUser);
      mockRepository.updateById.mockResolvedValue(deactivatedUser);

      const result = await userService.deactivateAccount('user123');

      expect(result.isActive).toBe(false);
      expect(result.password).toBeUndefined();
      expect(mockRepository.updateById).toHaveBeenCalledWith('user123', {
        isActive: false
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(userService.deactivateAccount('user123')).rejects.toThrow(NotFoundError);
    });
  });
});
