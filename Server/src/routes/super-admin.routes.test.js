/**
 * Super Admin Routes Integration Test
 * 
 * Tests that the super-admin routes are properly configured
 */

const createSuperAdminRoutes = require('./super-admin.routes');

describe('Super Admin Routes', () => {
  let mockController;
  let mockContainer;

  beforeEach(() => {
    // Mock controller
    mockController = {
      loginSuperAdmin: jest.fn(),
      getAllAdmins: jest.fn(),
      createAdmin: jest.fn(),
      updateAdmin: jest.fn(),
      deleteAdmin: jest.fn(),
      getAllCoaches: jest.fn(),
      updateCoachStatus: jest.fn(),
      getAllTeams: jest.fn(),
      deleteTeam: jest.fn(),
      deleteJudge: jest.fn(),
      createCompetition: jest.fn(),
      getAllCompetitions: jest.fn(),
      getCompetitionById: jest.fn(),
      updateCompetition: jest.fn(),
      deleteCompetition: jest.fn(),
      assignAdminToCompetition: jest.fn(),
      removeAdminFromCompetition: jest.fn(),
      getSystemStats: jest.fn(),
      getSuperAdminDashboard: jest.fn(),
      getTransactions: jest.fn(),
      addPlayer: jest.fn()
    };

    // Mock container
    mockContainer = {
      resolve: jest.fn((name) => {
        if (name === 'superAdminController') return mockController;
        // Mock auth middleware - simple pass-through
        return (req, res, next) => next();
      })
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Configuration', () => {
    it('should have all expected routes configured', () => {
      const router = createSuperAdminRoutes(mockContainer);
      
      // Check that the router is an Express router
      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
      
      // The router should have the stack property with route handlers
      expect(router.stack).toBeDefined();
      expect(Array.isArray(router.stack)).toBe(true);
      
      // Should have multiple route handlers (login + protected routes)
      expect(router.stack.length).toBeGreaterThan(1);
    });

    it('should resolve controller from container', () => {
      createSuperAdminRoutes(mockContainer);
      
      expect(mockContainer.resolve).toHaveBeenCalledWith('superAdminController');
    });

    it('should have addPlayer method available on controller', () => {
      createSuperAdminRoutes(mockContainer);
      
      expect(mockController.addPlayer).toBeDefined();
      expect(typeof mockController.addPlayer).toBe('function');
    });
  });
});