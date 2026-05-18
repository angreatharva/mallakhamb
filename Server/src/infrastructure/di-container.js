/**
 * Dependency Injection Container
 * 
 * Manages service and repository instances with support for:
 * - Singleton and transient lifecycle patterns
 * - Automatic dependency resolution
 * - Circular dependency detection
 */

class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.resolving = new Set(); // Track services being resolved for circular dependency detection
  }

  /**
   * Register a service with the container
   * @param {string} name - Service name (unique identifier)
   * @param {Function} factory - Factory function that creates the service instance
   * @param {string} lifecycle - 'singleton' (default) or 'transient'
   * @throws {Error} If name is invalid or lifecycle is not supported
   */
  register(name, factory, lifecycle = 'singleton') {
    if (!name || typeof name !== 'string') {
      throw new Error('Service name must be a non-empty string');
    }

    if (typeof factory !== 'function') {
      throw new Error(`Factory for service '${name}' must be a function`);
    }

    if (lifecycle !== 'singleton' && lifecycle !== 'transient') {
      throw new Error(`Invalid lifecycle '${lifecycle}' for service '${name}'. Must be 'singleton' or 'transient'`);
    }

    this.services.set(name, { factory, lifecycle });
  }

  /**
   * Resolve a service by name
   * @param {string} name - Service name
   * @returns {*} Service instance
   * @throws {Error} If service is not registered or circular dependency detected
   */
  resolve(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not registered in DI container`);
    }

    // Circular dependency detection
    if (this.resolving.has(name)) {
      const chain = Array.from(this.resolving).join(' -> ');
      throw new Error(`Circular dependency detected: ${chain} -> ${name}`);
    }

    const service = this.services.get(name);

    // Handle singleton lifecycle
    if (service.lifecycle === 'singleton') {
      if (!this.singletons.has(name)) {
        this.resolving.add(name);
        try {
          const instance = service.factory(this);
          this.singletons.set(name, instance);
        } finally {
          this.resolving.delete(name);
        }
      }
      return this.singletons.get(name);
    }

    // Handle transient lifecycle
    this.resolving.add(name);
    try {
      return service.factory(this);
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean} True if service is registered
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   * @returns {string[]} Array of service names
   */
  getRegisteredServices() {
    return Array.from(this.services.keys());
  }

  /**
   * Clear all services and singletons (useful for testing)
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.resolving.clear();
  }

  /**
   * Validate all registered dependencies can be resolved
   * This performs a dry-run resolution to detect issues at startup
   * @throws {Error} If any service cannot be resolved
   */
  validateDependencies() {
    const errors = [];

    for (const [name] of this.services) {
      try {
        // Attempt to resolve each service
        this.resolve(name);
      } catch (error) {
        errors.push(`Failed to resolve '${name}': ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Dependency validation failed:\n${errors.join('\n')}`);
    }
  }
}

// Export a singleton instance of the container
module.exports = new DIContainer();
