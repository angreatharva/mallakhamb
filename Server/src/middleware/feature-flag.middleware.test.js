/**
 * Feature Flag Middleware Tests
 * 
 * Tests middleware for checking feature flags before route execution.
 * 
 * Requirements: 15.1
 */

const { createFeatureFlagMiddleware, attachFeatureFlagChecker } = require('./feature-flag.middleware');
const { NotFoundError } = require('../errors');

describe('Feature Flag Middleware', () => {
  let mockFeatureFlagService;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockFeatureFlagService = {
      isEnabled: jest.fn()
    };

    mockReq = {
      user: {
        _id: 'user123',
        role: 'player'
      }
    };

    mockRes = {};

    mockNext = jest.fn();
  });

  describe('createFeatureFlagMiddleware', () => {
    it('should allow request when feature is enabled', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = middleware('test-feature');

      flagChecker(mockReq, mockRes, mockNext);

      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
        'test-feature',
        expect.objectContaining({
          userId: 'user123',
          role: 'player',
          user: mockReq.user
        })
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should block request when feature is disabled', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(false);
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = middleware('disabled-feature');

      flagChecker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(NotFoundError));
      expect(mockNext.mock.calls[0][0].message).toBe('Resource not found');
    });

    it('should handle requests without authenticated user', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = middleware('public-feature');

      const reqWithoutUser = {};
      flagChecker(reqWithoutUser, mockRes, mockNext);

      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
        'public-feature',
        expect.objectContaining({
          userId: undefined,
          role: undefined,
          user: undefined
        })
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should extract userId from user.id if _id not available', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = middleware('test-feature');

      const reqWithId = {
        user: {
          id: 'user456',
          role: 'coach'
        }
      };

      flagChecker(reqWithId, mockRes, mockNext);

      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
        'test-feature',
        expect.objectContaining({
          userId: 'user456',
          role: 'coach'
        })
      );
    });

    it('should handle errors from feature flag service', () => {
      mockFeatureFlagService.isEnabled.mockImplementation(() => {
        throw new Error('Service error');
      });
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = middleware('error-feature');

      flagChecker(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should create different middleware instances for different flags', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);
      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      
      const checker1 = middleware('feature1');
      const checker2 = middleware('feature2');

      checker1(mockReq, mockRes, mockNext);
      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith('feature1', expect.any(Object));

      mockFeatureFlagService.isEnabled.mockClear();

      checker2(mockReq, mockRes, mockNext);
      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith('feature2', expect.any(Object));
    });
  });

  describe('attachFeatureFlagChecker', () => {
    it('should attach isFeatureEnabled method to request', () => {
      const middleware = attachFeatureFlagChecker(mockFeatureFlagService);

      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.isFeatureEnabled).toBeDefined();
      expect(typeof mockReq.isFeatureEnabled).toBe('function');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow controllers to check flags programmatically', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);
      const middleware = attachFeatureFlagChecker(mockFeatureFlagService);

      middleware(mockReq, mockRes, mockNext);

      const result = mockReq.isFeatureEnabled('controller-feature');

      expect(result).toBe(true);
      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
        'controller-feature',
        expect.objectContaining({
          userId: 'user123',
          role: 'player',
          user: mockReq.user
        })
      );
    });

    it('should work without authenticated user', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(false);
      const middleware = attachFeatureFlagChecker(mockFeatureFlagService);

      const reqWithoutUser = {};
      middleware(reqWithoutUser, mockRes, mockNext);

      const result = reqWithoutUser.isFeatureEnabled('test-feature');

      expect(result).toBe(false);
      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledWith(
        'test-feature',
        expect.objectContaining({
          userId: undefined,
          role: undefined,
          user: undefined
        })
      );
    });

    it('should allow multiple flag checks in same request', () => {
      mockFeatureFlagService.isEnabled
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const middleware = attachFeatureFlagChecker(mockFeatureFlagService);
      middleware(mockReq, mockRes, mockNext);

      const result1 = mockReq.isFeatureEnabled('feature1');
      const result2 = mockReq.isFeatureEnabled('feature2');
      const result3 = mockReq.isFeatureEnabled('feature3');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(result3).toBe(true);
      expect(mockFeatureFlagService.isEnabled).toHaveBeenCalledTimes(3);
    });
  });

  describe('Integration', () => {
    it('should work together in middleware chain', () => {
      mockFeatureFlagService.isEnabled.mockReturnValue(true);

      const attachMiddleware = attachFeatureFlagChecker(mockFeatureFlagService);
      const checkMiddleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const flagChecker = checkMiddleware('integrated-feature');

      // First attach the checker
      attachMiddleware(mockReq, mockRes, mockNext);
      expect(mockReq.isFeatureEnabled).toBeDefined();

      // Then check the flag
      mockNext.mockClear();
      flagChecker(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle mixed enabled/disabled flags', () => {
      mockFeatureFlagService.isEnabled
        .mockReturnValueOnce(true)  // First flag enabled
        .mockReturnValueOnce(false); // Second flag disabled

      const middleware = createFeatureFlagMiddleware(mockFeatureFlagService);
      const checker1 = middleware('enabled-feature');
      const checker2 = middleware('disabled-feature');

      checker1(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith();

      mockNext.mockClear();

      checker2(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
