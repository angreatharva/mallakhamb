# Infrastructure Components

## DI Container

The Dependency Injection Container manages service and repository instances with support for singleton and transient lifecycle patterns.

### Features

- **Singleton Lifecycle**: Services are created once and reused across the application
- **Transient Lifecycle**: New instances are created each time the service is resolved
- **Automatic Dependency Resolution**: Dependencies are resolved automatically based on factory functions
- **Circular Dependency Detection**: Detects and reports circular dependencies at resolution time
- **Validation**: Can validate all dependencies at startup to catch configuration errors early

### Usage Example

```javascript
const container = require('./di-container');

// Register services
container.register('logger', () => new Logger(), 'singleton');
container.register('config', () => new ConfigManager(), 'singleton');

// Register with dependencies
container.register('playerRepository', (c) => 
  new PlayerRepository(c.resolve('logger')), 
  'singleton'
);

container.register('authService', (c) => 
  new AuthenticationService(
    c.resolve('playerRepository'),
    c.resolve('tokenService'),
    c.resolve('logger')
  ), 
  'singleton'
);

// Resolve services
const authService = container.resolve('authService');

// Validate all dependencies at startup
container.validateDependencies();
```

### API Reference

#### `register(name, factory, lifecycle)`

Register a service with the container.

- **name** (string): Unique service identifier
- **factory** (function): Factory function that creates the service instance. Receives the container as parameter.
- **lifecycle** (string): Either 'singleton' (default) or 'transient'

#### `resolve(name)`

Resolve a service by name. Returns the service instance.

- **name** (string): Service identifier

Throws an error if:
- Service is not registered
- Circular dependency is detected

#### `has(name)`

Check if a service is registered.

- **name** (string): Service identifier
- Returns: boolean

#### `getRegisteredServices()`

Get all registered service names.

- Returns: string[] - Array of service names

#### `validateDependencies()`

Validate all registered dependencies can be resolved. Useful to call at application startup to catch configuration errors early.

Throws an error if any service cannot be resolved.

#### `clear()`

Clear all services and singletons. Useful for testing.

### Testing

The DI Container includes comprehensive unit tests covering:
- Service registration and resolution
- Singleton vs transient lifecycles
- Circular dependency detection
- Error handling
- Complex dependency scenarios

Run tests with:
```bash
npm test -- di-container.test.js
```
