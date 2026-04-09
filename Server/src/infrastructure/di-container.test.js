/**
 * Unit tests for DI Container
 * 
 * Tests cover:
 * - Service registration and resolution
 * - Singleton vs transient lifecycles
 * - Circular dependency detection
 * - Error handling
 */

const DIContainer = require('./di-container');

describe('DIContainer', () => {
  // Clear container before each test to ensure isolation
  beforeEach(() => {
    DIContainer.clear();
  });

  describe('Service Registration', () => {
    test('should register a service with singleton lifecycle', () => {
      const factory = () => ({ value: 'test' });
      
      DIContainer.register('testService', factory, 'singleton');
      
      expect(DIContainer.has('testService')).toBe(true);
    });

    test('should register a service with transient lifecycle', () => {
      const factory = () => ({ value: 'test' });
      
      DIContainer.register('testService', factory, 'transient');
      
      expect(DIContainer.has('testService')).toBe(true);
    });

    test('should default to singleton lifecycle when not specified', () => {
      const factory = () => ({ value: 'test' });
      
      DIContainer.register('testService', factory);
      
      const instance1 = DIContainer.resolve('testService');
      const instance2 = DIContainer.resolve('testService');
      
      expect(instance1).toBe(instance2);
    });

    test('should throw error when registering with invalid name', () => {
      const factory = () => ({ value: 'test' });
      
      expect(() => DIContainer.register('', factory)).toThrow('Service name must be a non-empty string');
      expect(() => DIContainer.register(null, factory)).toThrow('Service name must be a non-empty string');
      expect(() => DIContainer.register(123, factory)).toThrow('Service name must be a non-empty string');
    });

    test('should throw error when registering with invalid factory', () => {
      expect(() => DIContainer.register('testService', 'not a function')).toThrow('Factory for service \'testService\' must be a function');
      expect(() => DIContainer.register('testService', null)).toThrow('Factory for service \'testService\' must be a function');
    });

    test('should throw error when registering with invalid lifecycle', () => {
      const factory = () => ({ value: 'test' });
      
      expect(() => DIContainer.register('testService', factory, 'invalid')).toThrow('Invalid lifecycle \'invalid\' for service \'testService\'. Must be \'singleton\' or \'transient\'');
    });

    test('should allow overwriting existing service registration', () => {
      const factory1 = () => ({ value: 'first' });
      const factory2 = () => ({ value: 'second' });
      
      DIContainer.register('testService', factory1);
      DIContainer.register('testService', factory2);
      
      const instance = DIContainer.resolve('testService');
      expect(instance.value).toBe('second');
    });
  });

  describe('Service Resolution', () => {
    test('should resolve a registered service', () => {
      const factory = () => ({ value: 'test' });
      
      DIContainer.register('testService', factory);
      const instance = DIContainer.resolve('testService');
      
      expect(instance).toEqual({ value: 'test' });
    });

    test('should throw error when resolving unregistered service', () => {
      expect(() => DIContainer.resolve('nonExistent')).toThrow('Service \'nonExistent\' not registered in DI container');
    });

    test('should pass container to factory function', () => {
      const factory = jest.fn((container) => {
        expect(container).toBe(DIContainer);
        return { value: 'test' };
      });
      
      DIContainer.register('testService', factory);
      DIContainer.resolve('testService');
      
      expect(factory).toHaveBeenCalledWith(DIContainer);
    });

    test('should resolve dependencies between services', () => {
      DIContainer.register('logger', () => ({ log: jest.fn() }));
      DIContainer.register('database', (c) => {
        const logger = c.resolve('logger');
        return { logger, query: jest.fn() };
      });
      
      const db = DIContainer.resolve('database');
      
      expect(db.logger).toBeDefined();
      expect(db.logger.log).toBeDefined();
    });
  });

  describe('Singleton Lifecycle', () => {
    test('should return same instance for singleton services', () => {
      let counter = 0;
      const factory = () => ({ id: ++counter });
      
      DIContainer.register('testService', factory, 'singleton');
      
      const instance1 = DIContainer.resolve('testService');
      const instance2 = DIContainer.resolve('testService');
      const instance3 = DIContainer.resolve('testService');
      
      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1.id).toBe(1);
    });

    test('should call factory only once for singleton services', () => {
      const factory = jest.fn(() => ({ value: 'test' }));
      
      DIContainer.register('testService', factory, 'singleton');
      
      DIContainer.resolve('testService');
      DIContainer.resolve('testService');
      DIContainer.resolve('testService');
      
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Transient Lifecycle', () => {
    test('should return new instance for transient services', () => {
      let counter = 0;
      const factory = () => ({ id: ++counter });
      
      DIContainer.register('testService', factory, 'transient');
      
      const instance1 = DIContainer.resolve('testService');
      const instance2 = DIContainer.resolve('testService');
      const instance3 = DIContainer.resolve('testService');
      
      expect(instance1).not.toBe(instance2);
      expect(instance2).not.toBe(instance3);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
      expect(instance3.id).toBe(3);
    });

    test('should call factory every time for transient services', () => {
      const factory = jest.fn(() => ({ value: 'test' }));
      
      DIContainer.register('testService', factory, 'transient');
      
      DIContainer.resolve('testService');
      DIContainer.resolve('testService');
      DIContainer.resolve('testService');
      
      expect(factory).toHaveBeenCalledTimes(3);
    });
  });

  describe('Circular Dependency Detection', () => {
    test('should detect direct circular dependency', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('serviceB') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { a: c.resolve('serviceA') };
      });
      
      expect(() => DIContainer.resolve('serviceA')).toThrow(/Circular dependency detected/);
    });

    test('should detect indirect circular dependency (A -> B -> C -> A)', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('serviceB') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { c: c.resolve('serviceC') };
      });
      
      DIContainer.register('serviceC', (c) => {
        return { a: c.resolve('serviceA') };
      });
      
      expect(() => DIContainer.resolve('serviceA')).toThrow(/Circular dependency detected/);
    });

    test('should include dependency chain in circular dependency error', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('serviceB') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { a: c.resolve('serviceA') };
      });
      
      try {
        DIContainer.resolve('serviceA');
        fail('Should have thrown circular dependency error');
      } catch (error) {
        expect(error.message).toContain('serviceA');
        expect(error.message).toContain('serviceB');
      }
    });

    test('should allow resolving same service after circular dependency error', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('serviceB') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { a: c.resolve('serviceA') };
      });
      
      // First attempt causes circular dependency
      expect(() => DIContainer.resolve('serviceA')).toThrow(/Circular dependency detected/);
      
      // Fix the circular dependency
      DIContainer.register('serviceB', () => ({ value: 'fixed' }));
      
      // Should now resolve successfully
      const instance = DIContainer.resolve('serviceA');
      expect(instance.b.value).toBe('fixed');
    });
  });

  describe('Utility Methods', () => {
    test('has() should return true for registered services', () => {
      DIContainer.register('testService', () => ({}));
      
      expect(DIContainer.has('testService')).toBe(true);
      expect(DIContainer.has('nonExistent')).toBe(false);
    });

    test('getRegisteredServices() should return all service names', () => {
      DIContainer.register('serviceA', () => ({}));
      DIContainer.register('serviceB', () => ({}));
      DIContainer.register('serviceC', () => ({}));
      
      const services = DIContainer.getRegisteredServices();
      
      expect(services).toHaveLength(3);
      expect(services).toContain('serviceA');
      expect(services).toContain('serviceB');
      expect(services).toContain('serviceC');
    });

    test('clear() should remove all services and singletons', () => {
      DIContainer.register('serviceA', () => ({ value: 'A' }));
      DIContainer.register('serviceB', () => ({ value: 'B' }));
      
      DIContainer.resolve('serviceA'); // Create singleton
      
      DIContainer.clear();
      
      expect(DIContainer.getRegisteredServices()).toHaveLength(0);
      expect(() => DIContainer.resolve('serviceA')).toThrow();
    });
  });

  describe('Dependency Validation', () => {
    test('should validate all dependencies successfully', () => {
      DIContainer.register('logger', () => ({ log: jest.fn() }));
      DIContainer.register('database', (c) => ({ logger: c.resolve('logger') }));
      DIContainer.register('userService', (c) => ({ db: c.resolve('database') }));
      
      expect(() => DIContainer.validateDependencies()).not.toThrow();
    });

    test('should throw error when validation finds unresolvable dependency', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('nonExistent') };
      });
      
      expect(() => DIContainer.validateDependencies()).toThrow(/Dependency validation failed/);
    });

    test('should throw error when validation finds circular dependency', () => {
      DIContainer.register('serviceA', (c) => {
        return { b: c.resolve('serviceB') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { a: c.resolve('serviceA') };
      });
      
      expect(() => DIContainer.validateDependencies()).toThrow(/Dependency validation failed/);
    });

    test('should report multiple validation errors', () => {
      DIContainer.register('serviceA', (c) => {
        return { x: c.resolve('nonExistent1') };
      });
      
      DIContainer.register('serviceB', (c) => {
        return { y: c.resolve('nonExistent2') };
      });
      
      try {
        DIContainer.validateDependencies();
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('serviceA');
        expect(error.message).toContain('serviceB');
      }
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle deep dependency chains', () => {
      DIContainer.register('level1', () => ({ value: 1 }));
      DIContainer.register('level2', (c) => ({ prev: c.resolve('level1'), value: 2 }));
      DIContainer.register('level3', (c) => ({ prev: c.resolve('level2'), value: 3 }));
      DIContainer.register('level4', (c) => ({ prev: c.resolve('level3'), value: 4 }));
      
      const result = DIContainer.resolve('level4');
      
      expect(result.value).toBe(4);
      expect(result.prev.value).toBe(3);
      expect(result.prev.prev.value).toBe(2);
      expect(result.prev.prev.prev.value).toBe(1);
    });

    test('should handle multiple services depending on same singleton', () => {
      const loggerFactory = jest.fn(() => ({ log: jest.fn() }));
      
      DIContainer.register('logger', loggerFactory, 'singleton');
      DIContainer.register('serviceA', (c) => ({ logger: c.resolve('logger') }));
      DIContainer.register('serviceB', (c) => ({ logger: c.resolve('logger') }));
      DIContainer.register('serviceC', (c) => ({ logger: c.resolve('logger') }));
      
      const a = DIContainer.resolve('serviceA');
      const b = DIContainer.resolve('serviceB');
      const c = DIContainer.resolve('serviceC');
      
      expect(a.logger).toBe(b.logger);
      expect(b.logger).toBe(c.logger);
      expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    test('should handle mix of singleton and transient services', () => {
      let singletonCount = 0;
      let transientCount = 0;
      
      DIContainer.register('singleton', () => ({ id: ++singletonCount }), 'singleton');
      DIContainer.register('transient', () => ({ id: ++transientCount }), 'transient');
      DIContainer.register('mixed', (c) => ({
        singleton: c.resolve('singleton'),
        transient: c.resolve('transient')
      }), 'transient'); // Changed to transient so it creates new instances
      
      const result1 = DIContainer.resolve('mixed');
      const result2 = DIContainer.resolve('mixed');
      
      // Singleton should be the same instance
      expect(result1.singleton).toBe(result2.singleton);
      // Transient should be different instances
      expect(result1.transient).not.toBe(result2.transient);
      expect(singletonCount).toBe(1);
      expect(transientCount).toBe(2);
    });
  });
});
