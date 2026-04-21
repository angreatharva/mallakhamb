/**
 * Admin Service Property-Based Tests
 * 
 * Property-based tests for AdminService using fast-check.
 * 
 * Feature: old-config-migration
 * Requirements: 2.6
 */

const fc = require('fast-check');
const AdminService = require('./admin.service');
const { ValidationError, ConflictError } = require('../../errors');

describe('AdminService - Property-Based Tests', () => {
  let adminService;
  let mockAdminRepository;
  let mockAuthenticationService;
  let mockLogger;

  beforeEach(() => {
    mockAdminRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      findByRole: jest.fn()
    };

    mockAuthenticationService = {
      register: jest.fn(),
      login: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    adminService = new AdminService({
      adminRepository: mockAdminRepository,
      playerRepository: {},
      coachRepository: {},
      competitionRepository: {},
      teamRepository: {},
      judgeRepository: {},
      scoreRepository: {},
      transactionRepository: {},
      calculationService: {},
      socketManager: null,
      logger: mockLogger,
      cacheService: {},
      authenticationService: mockAuthenticationService
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 1: Weak password rejection is universal
   * 
   * **Validates: Requirements 2.6**
   * 
   * For any string that fails the password strength validation rules 
   * (length < 8, no uppercase, no digit), submitting it to registerAdmin 
   * should result in a ValidationError being thrown, and no admin account 
   * should be created.
   */
  describe('Property 1: Weak password rejection is universal', () => {
    it('should reject all weak passwords (length < 8)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings with length < 8
          fc.string({ minLength: 0, maxLength: 7 }),
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (password, email, name) => {
            // Mock AuthenticationService to throw ValidationError for weak password
            mockAuthenticationService.register.mockRejectedValue(
              new ValidationError('Password must be at least 8 characters long')
            );

            const adminData = { email, password, name };

            // Expect ValidationError to be thrown
            await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ValidationError);

            // Verify AuthenticationService was called
            expect(mockAuthenticationService.register).toHaveBeenCalledWith(adminData, 'admin');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject all passwords without uppercase letters', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings with length >= 8 but no uppercase letters
          fc.string({ minLength: 8, maxLength: 20 })
            .filter(s => s.length >= 8 && !/[A-Z]/.test(s)),
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (password, email, name) => {
            // Mock AuthenticationService to throw ValidationError for missing uppercase
            mockAuthenticationService.register.mockRejectedValue(
              new ValidationError('Password must contain at least one uppercase letter')
            );

            const adminData = { email, password, name };

            // Expect ValidationError to be thrown
            await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ValidationError);

            // Verify AuthenticationService was called
            expect(mockAuthenticationService.register).toHaveBeenCalledWith(adminData, 'admin');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject all passwords without digits', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings with length >= 8 but no digits
          fc.string({ minLength: 8, maxLength: 20 })
            .filter(s => s.length >= 8 && !/\d/.test(s)),
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (password, email, name) => {
            // Mock AuthenticationService to throw ValidationError for missing digit
            mockAuthenticationService.register.mockRejectedValue(
              new ValidationError('Password must contain at least one digit')
            );

            const adminData = { email, password, name };

            // Expect ValidationError to be thrown
            await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ValidationError);

            // Verify AuthenticationService was called
            expect(mockAuthenticationService.register).toHaveBeenCalledWith(adminData, 'admin');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject passwords that fail multiple validation rules', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate weak passwords that fail multiple rules
          fc.oneof(
            // Too short
            fc.string({ minLength: 0, maxLength: 7 }),
            // No uppercase
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => s.length >= 8 && !/[A-Z]/.test(s)),
            // No digit
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => s.length >= 8 && !/\d/.test(s)),
            // No uppercase and no digit
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => s.length >= 8 && !/[A-Z]/.test(s) && !/\d/.test(s))
          ),
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (password, email, name) => {
            // Mock AuthenticationService to throw ValidationError
            mockAuthenticationService.register.mockRejectedValue(
              new ValidationError('Password does not meet requirements')
            );

            const adminData = { email, password, name };

            // Expect ValidationError to be thrown
            await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ValidationError);

            // Verify AuthenticationService was called
            expect(mockAuthenticationService.register).toHaveBeenCalledWith(adminData, 'admin');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
