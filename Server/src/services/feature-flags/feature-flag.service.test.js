/**
 * Feature Flag Service Tests
 * 
 * Tests flag evaluation, percentage rollouts, user-specific flags, and role-specific flags.
 * 
 * Requirements: 15.1
 */

const FeatureFlagService = require('./feature-flag.service');

describe('FeatureFlagService', () => {
  let mockConfig;
  let mockLogger;
  let service;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    };

    mockConfig = {
      get: jest.fn()
    };

    // Default empty flags
    mockConfig.get.mockReturnValue({});
  });

  describe('Boolean Flags', () => {
    it('should return false for non-existent flag', () => {
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('non-existent-flag');

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'non-existent-flag',
          enabled: false,
          reason: 'flag_not_found'
        })
      );
    });

    it('should return true for enabled boolean flag', () => {
      mockConfig.get.mockReturnValue({
        'new-feature': true
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('new-feature');

      expect(result).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'new-feature',
          enabled: true,
          reason: 'globally_enabled'
        })
      );
    });

    it('should return false for disabled boolean flag', () => {
      mockConfig.get.mockReturnValue({
        'old-feature': false
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('old-feature');

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'old-feature',
          enabled: false,
          reason: 'globally_disabled'
        })
      );
    });

    it('should handle complex boolean flag configuration', () => {
      mockConfig.get.mockReturnValue({
        'complex-feature': {
          enabled: true,
          type: 'boolean'
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('complex-feature');

      expect(result).toBe(true);
    });
  });

  describe('Percentage-Based Rollout', () => {
    it('should handle percentage as number', () => {
      mockConfig.get.mockReturnValue({
        'gradual-rollout': 50
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const context = { userId: 'user123' };
      const result = service.isEnabled('gradual-rollout', context);

      expect(typeof result).toBe('boolean');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'gradual-rollout',
          reason: 'percentage_rollout'
        })
      );
    });

    it('should handle percentage in object configuration', () => {
      mockConfig.get.mockReturnValue({
        'beta-feature': {
          enabled: true,
          type: 'percentage',
          percentage: 25
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const context = { userId: 'user456' };
      const result = service.isEnabled('beta-feature', context);

      expect(typeof result).toBe('boolean');
    });

    it('should return consistent results for same user', () => {
      mockConfig.get.mockReturnValue({
        'consistent-feature': 50
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const context = { userId: 'user789' };
      const result1 = service.isEnabled('consistent-feature', context);
      const result2 = service.isEnabled('consistent-feature', context);
      const result3 = service.isEnabled('consistent-feature', context);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should enable 0% of users when percentage is 0', () => {
      mockConfig.get.mockReturnValue({
        'zero-percent': 0
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(service.isEnabled('zero-percent', { userId: `user${i}` }));
      }

      const enabledCount = results.filter(r => r).length;
      expect(enabledCount).toBe(0);
    });

    it('should enable 100% of users when percentage is 100', () => {
      mockConfig.get.mockReturnValue({
        'full-rollout': 100
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(service.isEnabled('full-rollout', { userId: `user${i}` }));
      }

      const enabledCount = results.filter(r => r).length;
      expect(enabledCount).toBe(100);
    });

    it('should enable approximately correct percentage of users', () => {
      mockConfig.get.mockReturnValue({
        'fifty-percent': 50
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const results = [];
      for (let i = 0; i < 1000; i++) {
        results.push(service.isEnabled('fifty-percent', { userId: `user${i}` }));
      }

      const enabledCount = results.filter(r => r).length;
      const percentage = (enabledCount / 1000) * 100;

      // Allow 5% margin of error
      expect(percentage).toBeGreaterThan(45);
      expect(percentage).toBeLessThan(55);
    });

    it('should clamp percentage to 0-100 range', () => {
      mockConfig.get.mockReturnValue({
        'over-hundred': 150,
        'negative': -10
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const flag1 = service.getFlag('over-hundred');
      const flag2 = service.getFlag('negative');

      expect(flag1.percentage).toBe(100);
      expect(flag2.percentage).toBe(0);
    });
  });

  describe('User-Specific Flags', () => {
    it('should enable flag for specific users', () => {
      mockConfig.get.mockReturnValue({
        'vip-feature': {
          enabled: true,
          users: ['user123', 'user456']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result1 = service.isEnabled('vip-feature', { userId: 'user123' });
      const result2 = service.isEnabled('vip-feature', { userId: 'user456' });
      const result3 = service.isEnabled('vip-feature', { userId: 'user789' });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true); // Globally enabled, so others get it too
    });

    it('should enable flag only for specific users when globally disabled', () => {
      mockConfig.get.mockReturnValue({
        'beta-testers': {
          enabled: false,
          users: ['tester1', 'tester2']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result1 = service.isEnabled('beta-testers', { userId: 'tester1' });
      const result2 = service.isEnabled('beta-testers', { userId: 'regular-user' });

      expect(result1).toBe(false); // Globally disabled takes precedence
      expect(result2).toBe(false);
    });

    it('should exclude specific users', () => {
      mockConfig.get.mockReturnValue({
        'general-feature': {
          enabled: true,
          excludeUsers: ['blocked1', 'blocked2']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result1 = service.isEnabled('general-feature', { userId: 'blocked1' });
      const result2 = service.isEnabled('general-feature', { userId: 'regular-user' });

      expect(result1).toBe(false);
      expect(result2).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'general-feature',
          enabled: false,
          reason: 'user_excluded',
          userId: 'blocked1'
        })
      );
    });

    it('should prioritize user exclusion over user inclusion', () => {
      mockConfig.get.mockReturnValue({
        'conflicting-feature': {
          enabled: true,
          users: ['user123'],
          excludeUsers: ['user123']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('conflicting-feature', { userId: 'user123' });

      expect(result).toBe(false); // Exclusion wins
    });

    it('should extract userId from user object', () => {
      mockConfig.get.mockReturnValue({
        'user-obj-feature': {
          enabled: true,
          users: ['user123']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('user-obj-feature', {
        user: { _id: 'user123', role: 'player' }
      });

      expect(result).toBe(true);
    });
  });

  describe('Role-Specific Flags', () => {
    it('should enable flag for specific roles', () => {
      mockConfig.get.mockReturnValue({
        'admin-feature': {
          enabled: true,
          roles: ['admin', 'superadmin']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result1 = service.isEnabled('admin-feature', { role: 'admin' });
      const result2 = service.isEnabled('admin-feature', { role: 'superadmin' });
      const result3 = service.isEnabled('admin-feature', { role: 'player' });

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true); // Globally enabled
    });

    it('should exclude specific roles', () => {
      mockConfig.get.mockReturnValue({
        'player-feature': {
          enabled: true,
          excludeRoles: ['judge']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result1 = service.isEnabled('player-feature', { role: 'judge' });
      const result2 = service.isEnabled('player-feature', { role: 'player' });

      expect(result1).toBe(false);
      expect(result2).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'player-feature',
          enabled: false,
          reason: 'role_excluded',
          role: 'judge'
        })
      );
    });

    it('should prioritize role exclusion over role inclusion', () => {
      mockConfig.get.mockReturnValue({
        'conflicting-role-feature': {
          enabled: true,
          roles: ['admin'],
          excludeRoles: ['admin']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('conflicting-role-feature', { role: 'admin' });

      expect(result).toBe(false); // Exclusion wins
    });

    it('should extract role from user object', () => {
      mockConfig.get.mockReturnValue({
        'role-obj-feature': {
          enabled: true,
          roles: ['coach']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('role-obj-feature', {
        user: { _id: 'user123', role: 'coach' }
      });

      expect(result).toBe(true);
    });
  });

  describe('Priority and Precedence', () => {
    it('should prioritize user-specific over percentage rollout', () => {
      mockConfig.get.mockReturnValue({
        'priority-feature': {
          enabled: true,
          type: 'percentage',
          percentage: 0, // 0% rollout
          users: ['vip-user']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('priority-feature', { userId: 'vip-user' });

      expect(result).toBe(true); // User-specific overrides percentage
    });

    it('should prioritize role-specific over percentage rollout', () => {
      mockConfig.get.mockReturnValue({
        'role-priority-feature': {
          enabled: true,
          type: 'percentage',
          percentage: 0,
          roles: ['admin']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const result = service.isEnabled('role-priority-feature', { role: 'admin' });

      expect(result).toBe(true); // Role-specific overrides percentage
    });
  });

  describe('Flag Management', () => {
    it('should get all flags', () => {
      mockConfig.get.mockReturnValue({
        'flag1': true,
        'flag2': false,
        'flag3': 50
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const flags = service.getAllFlags();

      expect(flags).toHaveLength(3);
      expect(flags[0]).toMatchObject({
        name: 'flag1',
        enabled: true,
        type: 'boolean'
      });
      expect(flags[2]).toMatchObject({
        name: 'flag3',
        enabled: true,
        type: 'percentage',
        percentage: 50
      });
    });

    it('should get specific flag', () => {
      mockConfig.get.mockReturnValue({
        'test-flag': {
          enabled: true,
          users: ['user1', 'user2'],
          roles: ['admin']
        }
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      const flag = service.getFlag('test-flag');

      expect(flag).toMatchObject({
        name: 'test-flag',
        enabled: true,
        users: ['user1', 'user2'],
        roles: ['admin']
      });
    });

    it('should return null for non-existent flag', () => {
      service = new FeatureFlagService(mockConfig, mockLogger);

      const flag = service.getFlag('non-existent');

      expect(flag).toBeNull();
    });

    it('should check if flag exists', () => {
      mockConfig.get.mockReturnValue({
        'existing-flag': true
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(service.hasFlag('existing-flag')).toBe(true);
      expect(service.hasFlag('non-existent')).toBe(false);
    });
  });

  describe('Dynamic Flag Updates', () => {
    it('should update flag dynamically', () => {
      mockConfig.get.mockReturnValue({
        'dynamic-flag': false
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(service.isEnabled('dynamic-flag')).toBe(false);

      service.updateFlag('dynamic-flag', true);

      expect(service.isEnabled('dynamic-flag')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Feature flag updated',
        expect.objectContaining({
          flag: 'dynamic-flag'
        })
      );
    });

    it('should add new flag dynamically', () => {
      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(service.hasFlag('new-flag')).toBe(false);

      service.updateFlag('new-flag', true);

      expect(service.hasFlag('new-flag')).toBe(true);
      expect(service.isEnabled('new-flag')).toBe(true);
    });

    it('should remove flag', () => {
      mockConfig.get.mockReturnValue({
        'removable-flag': true
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(service.hasFlag('removable-flag')).toBe(true);

      const removed = service.removeFlag('removable-flag');

      expect(removed).toBe(true);
      expect(service.hasFlag('removable-flag')).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Feature flag removed',
        expect.objectContaining({
          flag: 'removable-flag'
        })
      );
    });

    it('should reload flags from configuration', () => {
      mockConfig.get.mockReturnValue({
        'initial-flag': true
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(service.hasFlag('initial-flag')).toBe(true);

      mockConfig.get.mockReturnValue({
        'reloaded-flag': true
      });

      service.reload();

      expect(service.hasFlag('initial-flag')).toBe(false);
      expect(service.hasFlag('reloaded-flag')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Feature flags reloaded');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration gracefully', () => {
      mockConfig.get.mockReturnValue(undefined);

      expect(() => {
        service = new FeatureFlagService(mockConfig, mockLogger);
      }).not.toThrow();

      expect(service.getAllFlags()).toHaveLength(0);
    });

    it('should handle configuration load errors', () => {
      mockConfig.get.mockImplementation(() => {
        throw new Error('Config error');
      });

      expect(() => {
        service = new FeatureFlagService(mockConfig, mockLogger);
      }).not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load feature flags',
        expect.any(Object)
      );
    });

    it('should handle invalid flag configurations', () => {
      mockConfig.get.mockReturnValue({
        'invalid-flag': null,
        'undefined-flag': undefined,
        'string-flag': 'invalid'
      });

      expect(() => {
        service = new FeatureFlagService(mockConfig, mockLogger);
      }).not.toThrow();

      // Invalid configs should default to disabled
      expect(service.isEnabled('invalid-flag')).toBe(false);
      expect(service.isEnabled('undefined-flag')).toBe(false);
      expect(service.isEnabled('string-flag')).toBe(false);
    });
  });

  describe('Logging', () => {
    it('should log flag evaluations', () => {
      mockConfig.get.mockReturnValue({
        'logged-flag': true
      });
      service = new FeatureFlagService(mockConfig, mockLogger);

      service.isEnabled('logged-flag', { userId: 'user123', role: 'admin' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature flag evaluated',
        expect.objectContaining({
          flag: 'logged-flag',
          enabled: true,
          userId: 'user123',
          role: 'admin'
        })
      );
    });

    it('should log flags loaded on initialization', () => {
      mockConfig.get.mockReturnValue({
        'flag1': true,
        'flag2': false
      });

      service = new FeatureFlagService(mockConfig, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Feature flags loaded',
        expect.objectContaining({
          count: 2,
          flags: expect.arrayContaining(['flag1', 'flag2'])
        })
      );
    });
  });
});
