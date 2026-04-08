# Requirements Document: Server Architecture Refactoring

## Introduction

This document specifies the requirements for refactoring the Mallakhamb Competition Management System backend server to improve performance, scalability, maintainability, and production-readiness. The refactoring will transform the current monolithic architecture into a well-structured, layered architecture following industry best practices while maintaining complete backward compatibility with existing API contracts.

The current system is a Node.js/Express backend with Socket.IO for real-time scoring, serving a role-based competition management system (SuperAdmin, Admin, Judge, Coach, Player) with MongoDB persistence. The refactoring addresses critical architectural issues including tight coupling, lack of service layer, poor testability, and missing production-grade features.

## Glossary

- **Server**: The Node.js/Express backend application
- **Service_Layer**: Business logic layer that sits between controllers and data access
- **Repository**: Data access layer that abstracts database operations
- **Controller**: HTTP request handler that delegates to services
- **Middleware**: Express middleware functions for cross-cutting concerns
- **Socket_Manager**: Abstraction for Socket.IO real-time communication
- **Cache_Manager**: Caching abstraction for performance optimization
- **Health_Monitor**: System health checking and reporting component
- **Dependency_Container**: Dependency injection container for managing object lifecycles
- **API_Contract**: The existing HTTP API interface that must remain unchanged
- **Real_Time_Service**: Service handling Socket.IO connections and events
- **Error_Handler**: Centralized error handling and logging system
- **Configuration_Manager**: Environment and runtime configuration management
- **Validation_Service**: Input validation and sanitization service
- **Authentication_Service**: User authentication and token management
- **Authorization_Service**: Permission and access control management
- **Database_Connection_Pool**: MongoDB connection pool manager
- **Graceful_Shutdown_Handler**: Process termination and cleanup coordinator
- **Metrics_Collector**: Performance and usage metrics gathering system
- **Logger**: Structured logging system
- **Email_Service**: Email sending abstraction
- **OTP_Service**: One-time password generation and validation
- **Scoring_Service**: Competition scoring business logic
- **Competition_Service**: Competition management business logic
- **Team_Service**: Team management business logic
- **User_Service**: User management business logic (players, coaches, judges, admins)

## Requirements

### Requirement 1: Service Layer Implementation

**User Story:** As a developer, I want a service layer that encapsulates business logic, so that controllers remain thin and business rules are reusable and testable.

#### Acceptance Criteria

1. THE Server SHALL implement a service layer that separates business logic from HTTP handling
2. WHEN a controller receives a request, THE Controller SHALL delegate business logic to the appropriate service
3. THE Service_Layer SHALL NOT depend on Express request/response objects
4. THE Service_Layer SHALL return plain JavaScript objects or throw domain-specific errors
5. THE Server SHALL implement services for: Authentication_Service, Authorization_Service, Competition_Service, Team_Service, User_Service, Scoring_Service, Email_Service, OTP_Service
6. FOR ALL existing controller methods, THE Server SHALL extract business logic into service methods while maintaining identical API behavior
7. THE Service_Layer SHALL handle transaction management for multi-step operations
8. THE Service_Layer SHALL validate business rules before delegating to repositories

### Requirement 2: Repository Pattern for Data Access

**User Story:** As a developer, I want a repository layer that abstracts database operations, so that data access logic is centralized and the application is database-agnostic.

#### Acceptance Criteria

1. THE Server SHALL implement repository classes for each domain model (Player, Coach, Admin, Judge, Team, Competition, Score, Transaction)
2. THE Repository SHALL encapsulate all Mongoose query operations
3. THE Repository SHALL provide standard CRUD methods (create, findById, findOne, find, update, delete)
4. THE Repository SHALL provide domain-specific query methods (e.g., findByEmail, findActiveCompetitions)
5. WHEN a service needs data access, THE Service SHALL use repository methods instead of direct model access
6. THE Repository SHALL handle query optimization, indexing hints, and projection
7. THE Repository SHALL return plain JavaScript objects or domain entities, not Mongoose documents
8. THE Repository SHALL handle soft deletes consistently across all entities

### Requirement 3: Dependency Injection Container

**User Story:** As a developer, I want dependency injection for managing object lifecycles, so that components are loosely coupled and easily testable.

#### Acceptance Criteria

1. THE Server SHALL implement a Dependency_Container that manages service and repository instances
2. THE Dependency_Container SHALL support singleton and transient lifecycle patterns
3. WHEN the Server starts, THE Dependency_Container SHALL initialize all services and repositories
4. THE Dependency_Container SHALL resolve dependencies automatically based on constructor parameters
5. THE Server SHALL use the Dependency_Container to inject dependencies into controllers and middleware
6. THE Dependency_Container SHALL support registration of mock implementations for testing
7. THE Dependency_Container SHALL provide a clear API for registering and resolving dependencies
8. THE Dependency_Container SHALL detect and report circular dependencies at startup

### Requirement 4: Socket.IO Architecture Refactoring

**User Story:** As a developer, I want a clean Socket.IO architecture, so that real-time features are maintainable and testable.

#### Acceptance Criteria

1. THE Server SHALL extract Socket.IO logic from server.js into a dedicated Socket_Manager
2. THE Socket_Manager SHALL handle connection authentication using Authentication_Service
3. THE Socket_Manager SHALL organize event handlers into separate handler modules by domain (scoring, notifications)
4. WHEN a socket event occurs, THE Socket_Manager SHALL delegate to appropriate Real_Time_Service
5. THE Real_Time_Service SHALL validate user permissions using Authorization_Service before processing events
6. THE Socket_Manager SHALL support room management with validation
7. THE Socket_Manager SHALL emit events through a clean API that services can use
8. THE Socket_Manager SHALL handle connection lifecycle (connect, disconnect, error) consistently

### Requirement 5: Configuration Management

**User Story:** As a developer, I want centralized configuration management, so that environment-specific settings are organized and validated.

#### Acceptance Criteria

1. THE Server SHALL implement a Configuration_Manager that loads and validates all environment variables at startup
2. THE Configuration_Manager SHALL provide typed access to configuration values (string, number, boolean, array)
3. WHEN a required environment variable is missing, THE Configuration_Manager SHALL throw a descriptive error at startup
4. THE Configuration_Manager SHALL support default values for optional configuration
5. THE Configuration_Manager SHALL organize configuration into logical groups (database, server, email, security, external_services)
6. THE Configuration_Manager SHALL validate configuration values (e.g., port ranges, URL formats)
7. THE Configuration_Manager SHALL expose configuration through a read-only interface
8. THE Configuration_Manager SHALL support environment-specific overrides (development, production, test)

### Requirement 6: Error Handling Standardization

**User Story:** As a developer, I want standardized error handling, so that errors are consistent, logged properly, and provide useful information.

#### Acceptance Criteria

1. THE Server SHALL implement domain-specific error classes (ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, BusinessRuleError)
2. THE Error_Handler SHALL map domain errors to appropriate HTTP status codes
3. WHEN an error occurs in a service, THE Service SHALL throw a domain-specific error with context
4. THE Error_Handler SHALL log errors with appropriate severity levels (error, warn, info)
5. THE Error_Handler SHALL sanitize error messages in production to avoid exposing sensitive information
6. THE Error_Handler SHALL include request correlation IDs for tracing
7. THE Error_Handler SHALL format error responses consistently across all endpoints
8. THE Error_Handler SHALL handle async errors and promise rejections globally

### Requirement 7: Caching Strategy Implementation

**User Story:** As a developer, I want a caching layer for frequently accessed data, so that database load is reduced and response times improve.

#### Acceptance Criteria

1. THE Server SHALL implement a Cache_Manager that provides a unified caching interface
2. THE Cache_Manager SHALL support in-memory caching with TTL (time-to-live) expiration
3. THE Cache_Manager SHALL cache frequently accessed data (competitions, user profiles, team rosters)
4. WHEN cached data is requested, THE Cache_Manager SHALL return cached value if valid
5. WHEN cached data expires or is invalidated, THE Cache_Manager SHALL fetch fresh data from repository
6. THE Cache_Manager SHALL provide cache invalidation methods (invalidate by key, invalidate by pattern, clear all)
7. THE Cache_Manager SHALL track cache hit/miss rates for monitoring
8. THE Cache_Manager SHALL support cache warming for critical data at startup

### Requirement 8: Health Check and Monitoring

**User Story:** As an operator, I want comprehensive health checks and monitoring, so that I can detect and diagnose issues quickly.

#### Acceptance Criteria

1. THE Server SHALL implement a Health_Monitor that checks system health
2. THE Health_Monitor SHALL check database connectivity with timeout
3. THE Health_Monitor SHALL check external service availability (email service)
4. THE Health_Monitor SHALL report memory usage and process uptime
5. WHEN a health check endpoint is called, THE Health_Monitor SHALL return status for all components
6. THE Health_Monitor SHALL provide liveness probe (is server running) and readiness probe (is server ready to accept traffic)
7. THE Health_Monitor SHALL expose metrics endpoint with performance data (request count, response times, error rates)
8. THE Health_Monitor SHALL support custom health checks for domain-specific requirements

### Requirement 9: Database Connection Pool Optimization

**User Story:** As a developer, I want optimized database connection pooling, so that database performance is maximized and connection issues are handled gracefully.

#### Acceptance Criteria

1. THE Server SHALL configure MongoDB connection pool with production-appropriate settings
2. THE Database_Connection_Pool SHALL set minimum pool size to 10 connections
3. THE Database_Connection_Pool SHALL set maximum pool size to 100 connections
4. THE Database_Connection_Pool SHALL set connection timeout to 10 seconds
5. THE Database_Connection_Pool SHALL set socket timeout to 45 seconds
6. THE Database_Connection_Pool SHALL enable connection monitoring and logging
7. WHEN database connection fails, THE Database_Connection_Pool SHALL retry with exponential backoff
8. THE Database_Connection_Pool SHALL emit events for connection lifecycle (connected, disconnected, error)

### Requirement 10: Graceful Shutdown Implementation

**User Story:** As an operator, I want graceful shutdown handling, so that in-flight requests complete and resources are cleaned up properly during deployment.

#### Acceptance Criteria

1. THE Server SHALL implement a Graceful_Shutdown_Handler that coordinates shutdown
2. WHEN SIGTERM or SIGINT signal is received, THE Graceful_Shutdown_Handler SHALL stop accepting new requests
3. THE Graceful_Shutdown_Handler SHALL wait for in-flight HTTP requests to complete (max 30 seconds)
4. THE Graceful_Shutdown_Handler SHALL close Socket.IO connections gracefully
5. THE Graceful_Shutdown_Handler SHALL close database connections after requests complete
6. THE Graceful_Shutdown_Handler SHALL flush logs and metrics before exit
7. THE Graceful_Shutdown_Handler SHALL exit with appropriate status code (0 for clean shutdown, 1 for error)
8. THE Graceful_Shutdown_Handler SHALL log shutdown progress at each stage

### Requirement 11: Request Validation Middleware

**User Story:** As a developer, I want centralized request validation, so that validation logic is reusable and consistent across endpoints.

#### Acceptance Criteria

1. THE Server SHALL implement a Validation_Service that provides validation schemas
2. THE Validation_Service SHALL use express-validator for input validation
3. THE Server SHALL create validation middleware for each endpoint that validates request body, query, and params
4. WHEN validation fails, THE Validation_Service SHALL return 400 status with detailed error messages
5. THE Validation_Service SHALL sanitize inputs to prevent injection attacks
6. THE Validation_Service SHALL validate data types, formats, ranges, and business rules
7. THE Validation_Service SHALL provide reusable validation rules (email, password, ObjectId, date range)
8. THE Validation_Service SHALL validate nested objects and arrays

### Requirement 12: Logging Infrastructure

**User Story:** As a developer, I want structured logging, so that logs are searchable, filterable, and useful for debugging and monitoring.

#### Acceptance Criteria

1. THE Server SHALL implement a Logger that provides structured logging
2. THE Logger SHALL support log levels (error, warn, info, debug, trace)
3. THE Logger SHALL include context in log entries (timestamp, level, message, requestId, userId, metadata)
4. THE Logger SHALL write logs in JSON format for production
5. THE Logger SHALL write human-readable logs for development
6. THE Logger SHALL support log rotation and archival
7. THE Logger SHALL redact sensitive information (passwords, tokens, PII) from logs
8. THE Logger SHALL provide correlation IDs for tracing requests across services

### Requirement 13: Middleware Organization

**User Story:** As a developer, I want organized middleware, so that cross-cutting concerns are applied consistently and in the correct order.

#### Acceptance Criteria

1. THE Server SHALL organize middleware into logical categories (security, logging, validation, authentication, error handling)
2. THE Server SHALL apply middleware in the correct order (security → logging → parsing → authentication → routes → error handling)
3. THE Server SHALL extract middleware configuration from server.js into separate middleware modules
4. THE Server SHALL document middleware execution order and purpose
5. THE Server SHALL implement request correlation ID middleware that assigns unique ID to each request
6. THE Server SHALL implement request timing middleware that tracks request duration
7. THE Server SHALL implement security headers middleware (helmet, CORS, rate limiting)
8. THE Server SHALL implement audit logging middleware for sensitive operations

### Requirement 14: Route Organization

**User Story:** As a developer, I want organized route definitions, so that API structure is clear and maintainable.

#### Acceptance Criteria

1. THE Server SHALL organize routes by domain (auth, users, competitions, teams, scoring, admin)
2. THE Server SHALL extract route registration from server.js into a route loader module
3. THE Server SHALL apply route-specific middleware (authentication, authorization, validation) in route definitions
4. THE Server SHALL document each route with OpenAPI/Swagger annotations
5. THE Server SHALL version API routes (e.g., /api/v1/competitions)
6. THE Server SHALL implement route-level rate limiting for sensitive endpoints
7. THE Server SHALL group related routes under common prefixes
8. THE Server SHALL validate route parameters using middleware

### Requirement 15: Testing Infrastructure

**User Story:** As a developer, I want comprehensive testing infrastructure, so that refactored code is verified and regressions are prevented.

#### Acceptance Criteria

1. THE Server SHALL provide unit test examples for services using Jest
2. THE Server SHALL provide integration test examples for repositories using test database
3. THE Server SHALL provide API test examples for controllers using supertest
4. THE Server SHALL provide test fixtures and factories for creating test data
5. THE Server SHALL provide mock implementations for external dependencies (email, database)
6. THE Server SHALL achieve minimum 80% code coverage for service layer
7. THE Server SHALL provide test utilities for authentication and authorization testing
8. THE Server SHALL provide Socket.IO testing utilities for real-time feature testing

### Requirement 16: Performance Optimization

**User Story:** As a developer, I want performance optimizations, so that the server handles load efficiently and responds quickly.

#### Acceptance Criteria

1. THE Server SHALL implement database query optimization (indexes, projections, lean queries)
2. THE Server SHALL implement response compression for large payloads
3. THE Server SHALL implement pagination for list endpoints with configurable page size
4. THE Server SHALL implement field selection (sparse fieldsets) for reducing response size
5. THE Server SHALL implement connection pooling for database and external services
6. THE Server SHALL implement request coalescing for duplicate concurrent requests
7. THE Server SHALL implement lazy loading for related entities
8. THE Server SHALL profile and optimize slow endpoints (target: 95th percentile < 200ms)

### Requirement 17: Security Enhancements

**User Story:** As a security engineer, I want enhanced security measures, so that the application is protected against common vulnerabilities.

#### Acceptance Criteria

1. THE Server SHALL implement rate limiting per user (not just per IP) for authenticated endpoints
2. THE Server SHALL implement request size limits per endpoint type
3. THE Server SHALL implement CSRF protection for state-changing operations
4. THE Server SHALL implement security headers (CSP, HSTS, X-Frame-Options)
5. THE Server SHALL implement input sanitization at service layer (in addition to middleware)
6. THE Server SHALL implement audit logging for sensitive operations (login, password reset, data modification)
7. THE Server SHALL implement token rotation for long-lived sessions
8. THE Server SHALL implement IP whitelisting for admin endpoints in production

### Requirement 18: Documentation and Migration Guide

**User Story:** As a developer, I want comprehensive documentation, so that I can understand the new architecture and migrate existing code.

#### Acceptance Criteria

1. THE Server SHALL provide architecture documentation explaining layered structure
2. THE Server SHALL provide migration guide for converting existing controllers to new pattern
3. THE Server SHALL provide API documentation for all services and repositories
4. THE Server SHALL provide dependency injection guide with examples
5. THE Server SHALL provide testing guide with examples for each layer
6. THE Server SHALL provide deployment guide with production configuration
7. THE Server SHALL provide troubleshooting guide for common issues
8. THE Server SHALL provide code examples demonstrating best practices for each pattern

### Requirement 19: Backward Compatibility

**User Story:** As a frontend developer, I want complete backward compatibility, so that existing clients continue to work without changes.

#### Acceptance Criteria

1. THE Server SHALL maintain all existing API endpoints with identical request/response formats
2. THE Server SHALL maintain all existing authentication and authorization behavior
3. THE Server SHALL maintain all existing Socket.IO events and payloads
4. THE Server SHALL maintain all existing error response formats
5. THE Server SHALL maintain all existing rate limiting behavior
6. THE Server SHALL maintain all existing CORS configuration
7. THE Server SHALL pass all existing integration tests without modification
8. THE Server SHALL support gradual migration (old and new patterns coexist during transition)

### Requirement 20: Observability and Metrics

**User Story:** As an operator, I want observability into system behavior, so that I can monitor performance and diagnose issues.

#### Acceptance Criteria

1. THE Server SHALL implement a Metrics_Collector that tracks key performance indicators
2. THE Metrics_Collector SHALL track request count by endpoint and status code
3. THE Metrics_Collector SHALL track response time percentiles (p50, p95, p99)
4. THE Metrics_Collector SHALL track error rates by type
5. THE Metrics_Collector SHALL track database query performance
6. THE Metrics_Collector SHALL track cache hit/miss rates
7. THE Metrics_Collector SHALL track active Socket.IO connections
8. THE Metrics_Collector SHALL expose metrics in Prometheus format for monitoring systems

### Requirement 21: Email Service Abstraction

**User Story:** As a developer, I want a unified email service abstraction, so that email providers can be swapped without changing business logic.

#### Acceptance Criteria

1. THE Server SHALL implement an Email_Service interface that abstracts email sending
2. THE Email_Service SHALL support multiple providers (Nodemailer, Resend) through adapter pattern
3. THE Email_Service SHALL provide template rendering for common email types (OTP, password reset, notifications)
4. WHEN email sending fails, THE Email_Service SHALL retry with exponential backoff
5. THE Email_Service SHALL queue emails for asynchronous sending
6. THE Email_Service SHALL track email delivery status
7. THE Email_Service SHALL provide email preview functionality for development
8. THE Email_Service SHALL validate email addresses before sending

### Requirement 22: Utility Module Organization

**User Story:** As a developer, I want organized utility modules, so that helper functions are discoverable and maintainable.

#### Acceptance Criteria

1. THE Server SHALL reorganize the 18+ utility files into logical modules
2. THE Server SHALL group authentication utilities (OTP, tokens, password validation) into auth module
3. THE Server SHALL group validation utilities (sanitization, score validation) into validation module
4. THE Server SHALL group email utilities (email service, templates) into email module
5. THE Server SHALL group security utilities (account lockout, token invalidation) into security module
6. THE Server SHALL group data utilities (pagination, ObjectId utils) into data module
7. THE Server SHALL group scoring utilities (scoring calculations) into scoring module
8. THE Server SHALL remove duplicate functionality and consolidate similar utilities

### Requirement 23: Environment-Specific Configuration

**User Story:** As an operator, I want environment-specific configuration, so that the server behaves appropriately in development, staging, and production.

#### Acceptance Criteria

1. THE Server SHALL load configuration based on NODE_ENV (development, staging, production, test)
2. THE Server SHALL enable debug logging in development and structured logging in production
3. THE Server SHALL enable ngrok in development and disable in production
4. THE Server SHALL use strict CORS in production and relaxed CORS in development
5. THE Server SHALL enable detailed error messages in development and sanitized messages in production
6. THE Server SHALL use different rate limits for development and production
7. THE Server SHALL enable performance profiling in development and disable in production
8. THE Server SHALL validate that production-required environment variables are set

### Requirement 24: Database Migration Support

**User Story:** As a developer, I want database migration support, so that schema changes are versioned and applied consistently.

#### Acceptance Criteria

1. THE Server SHALL implement a migration system for database schema changes
2. THE Server SHALL track applied migrations in a migrations collection
3. THE Server SHALL provide CLI commands for running migrations (up, down, status)
4. THE Server SHALL validate migration order and dependencies
5. THE Server SHALL support data migrations in addition to schema migrations
6. THE Server SHALL rollback migrations on failure
7. THE Server SHALL provide migration templates for common operations
8. THE Server SHALL prevent running server with pending migrations in production

### Requirement 25: Feature Flag System

**User Story:** As a product manager, I want feature flags, so that new features can be deployed safely and rolled out gradually.

#### Acceptance Criteria

1. THE Server SHALL implement a feature flag system for controlling feature availability
2. THE Server SHALL support boolean flags (on/off) and percentage-based rollouts
3. THE Server SHALL support user-specific and role-specific feature flags
4. THE Server SHALL load feature flags from configuration or database
5. THE Server SHALL provide middleware for checking feature flags before route execution
6. THE Server SHALL provide service methods for checking feature flags in business logic
7. THE Server SHALL log feature flag evaluations for audit
8. THE Server SHALL support dynamic flag updates without server restart

## Implementation Notes

### Phased Approach

The refactoring should be implemented in phases to minimize risk:

1. **Phase 1: Foundation** - Implement core infrastructure (DI container, configuration, logging, error handling)
2. **Phase 2: Data Layer** - Implement repository pattern for all models
3. **Phase 3: Service Layer** - Extract business logic into services
4. **Phase 4: Controller Refactoring** - Update controllers to use services
5. **Phase 5: Socket.IO Refactoring** - Extract and organize real-time features
6. **Phase 6: Performance & Monitoring** - Add caching, metrics, health checks
7. **Phase 7: Testing & Documentation** - Complete test coverage and documentation

### Migration Strategy

- Implement new patterns alongside existing code
- Migrate one domain at a time (e.g., authentication first, then competitions)
- Maintain 100% backward compatibility throughout migration
- Use feature flags to control rollout of refactored components
- Run old and new implementations in parallel with comparison logging

### Testing Strategy

- Write tests for new services before migrating controller logic
- Maintain existing integration tests as regression suite
- Add new unit tests for service layer (target: 80% coverage)
- Add new integration tests for repository layer
- Add performance tests to validate optimization improvements

### Performance Targets

- API response time: p95 < 200ms, p99 < 500ms
- Database query time: p95 < 50ms
- Cache hit rate: > 80% for frequently accessed data
- Memory usage: < 512MB under normal load
- Concurrent connections: Support 1000+ simultaneous Socket.IO connections

### Security Considerations

- All input validation at both middleware and service layers
- Rate limiting per user and per IP
- Audit logging for all sensitive operations
- Token rotation every 24 hours
- Secrets stored in environment variables, never in code
- Regular dependency updates for security patches

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Ready for Review
