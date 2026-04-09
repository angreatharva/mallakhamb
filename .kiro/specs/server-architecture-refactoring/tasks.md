# Implementation Plan: Server Architecture Refactoring

## Overview

This implementation plan transforms the Mallakhamb Competition Management System backend from a monolithic architecture to a well-structured, layered architecture. The refactoring introduces service layer, repository pattern, dependency injection, and production-grade features while maintaining 100% backward compatibility.

The implementation follows a 7-phase approach where each phase builds incrementally on previous work, allowing for continuous validation and rollback if needed.

## Phase 1: Foundation (Week 1-2)

- [x] 1. Set up new directory structure
  - Create `Server/src/` directory with subdirectories: config, controllers, services, repositories, middleware, routes, socket, validators, errors, utils, infrastructure, migrations
  - Create test directories: tests/unit, tests/integration, tests/e2e, tests/fixtures, tests/mocks, tests/helpers
  - Create docs directory for documentation
  - _Requirements: 5, 18_

- [x] 2. Implement Dependency Injection Container
  - [x] 2.1 Create DI Container class with registration and resolution
    - Implement `register(name, factory, lifecycle)` method
    - Implement `resolve(name)` method with singleton/transient support
    - Implement circular dependency detection
    - _Requirements: 3.1, 3.2, 3.3, 3.8_
  
  - [x] 2.2 Write unit tests for DI Container
    - Test service registration and resolution
    - Test singleton vs transient lifecycles
    - Test circular dependency detection
    - _Requirements: 3.6, 15.1_

- [x] 3. Implement Configuration Manager
  - [x] 3.1 Create ConfigManager class with environment variable loading
    - Implement configuration loading for server, database, JWT, email, security, cache, features
    - Implement typed getters (getString, getNumber, getBoolean, getArray, getRequired)
    - Implement configuration validation at startup
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 23.1_
  
  - [x] 3.2 Write unit tests for Configuration Manager
    - Test configuration loading and validation
    - Test required field validation
    - Test type conversion
    - _Requirements: 5.3, 15.1_

- [x] 4. Implement Logger with Winston
  - [x] 4.1 Create Logger class with structured logging
    - Implement Winston logger with development and production formats
    - Implement log levels (error, warn, info, debug, http)
    - Implement sensitive data redaction
    - Configure file transports with rotation
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [x] 4.2 Write unit tests for Logger
    - Test log formatting
    - Test sensitive data redaction
    - Test log levels
    - _Requirements: 12.7, 15.1_

- [x] 5. Implement Error Classes
  - [x] 5.1 Create base error class and domain-specific errors
    - Implement BaseError with statusCode, code, details
    - Implement ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, BusinessRuleError
    - Implement error serialization (toJSON)
    - _Requirements: 6.1, 6.2, 6.3, 6.7_
  
  - [x] 5.2 Write unit tests for Error Classes
    - Test error creation and serialization
    - Test error properties
    - _Requirements: 15.1_

- [x] 6. Implement Error Handling Middleware
  - [x] 6.1 Create ErrorMiddleware class
    - Implement global error handler with logging
    - Implement error formatting (development vs production)
    - Implement 404 handler
    - Implement asyncHandler wrapper
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 6.2 Write unit tests for Error Middleware
    - Test error handling and formatting
    - Test environment-specific behavior
    - _Requirements: 15.1_

- [x] 7. Create bootstrap module for DI registration
  - Implement bootstrap function that registers all infrastructure components
  - Register config, logger in DI container
  - _Requirements: 3.4, 3.5_

- [x] 8. Checkpoint - Verify foundation infrastructure
  - Ensure all tests pass, ask the user if questions arise.


## Phase 2: Data Layer (Week 3-4)

- [ ] 9. Implement Base Repository
  - [ ] 9.1 Create BaseRepository class with common CRUD operations
    - Implement create, findById, findOne, find, updateById, deleteById methods
    - Implement count, exists helper methods
    - Implement query options support (select, populate, sort, limit, skip)
    - Implement soft delete support
    - Use .lean() for performance
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 16.1_
  
  - [ ] 9.2 Write unit tests for Base Repository
    - Test CRUD operations with mocked Mongoose model
    - Test query options
    - Test error handling
    - _Requirements: 2.5, 15.2, 15.6_

- [ ] 10. Implement domain-specific repositories
  - [ ] 10.1 Create PlayerRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByEmail, findActive, findByTeam, findByAgeGroupAndGender
    - Implement updateTeam, isEmailTaken, findPaginated
    - _Requirements: 2.1, 2.4, 2.5, 16.3_
  
  - [ ] 10.2 Create CoachRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByEmail, findActive, isEmailTaken, findPaginated
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.3 Create AdminRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByEmail, findActive, isEmailTaken, findByRole
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.4 Create JudgeRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByEmail, findActive, findByCompetition
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.5 Create CompetitionRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findActive, findByStatus, findUpcoming, findByDateRange
    - Implement addTeam, removeTeam, updateRegistration
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.6 Create TeamRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByCoach, findByCompetition, addPlayer, removePlayer
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.7 Create ScoreRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByCompetition, findByPlayer, findByJudge, calculateAverages
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 10.8 Create TransactionRepository with domain-specific methods
    - Extend BaseRepository
    - Implement findByUser, findByStatus, findByDateRange
    - _Requirements: 2.1, 2.4, 2.5_

- [ ] 11. Register repositories in DI container
  - Update bootstrap module to register all repositories
  - Inject logger into each repository
  - _Requirements: 3.4, 3.5_

- [ ] 12. Write integration tests for repositories
  - [ ] 12.1 Write integration tests for PlayerRepository
    - Test CRUD operations with test database
    - Test domain-specific queries
    - Test pagination
    - _Requirements: 15.2, 15.6_
  
  - [ ] 12.2 Write integration tests for other repositories
    - Test CompetitionRepository, TeamRepository, ScoreRepository
    - Test complex queries and relationships
    - _Requirements: 15.2, 15.6_

- [ ] 13. Checkpoint - Verify repository layer
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Service Layer (Week 5-7)

- [ ] 14. Implement Authentication Services
  - [ ] 14.1 Create TokenService for JWT operations
    - Implement generateToken, verifyToken, refreshToken
    - Use ConfigManager for JWT configuration
    - _Requirements: 1.5, 1.8_
  
  - [ ] 14.2 Create OTPService for OTP generation and validation
    - Implement generateAndSendOTP, verifyOTP
    - Integrate with email service
    - Track OTP attempts and expiration
    - _Requirements: 1.5, 1.8_
  
  - [ ] 14.3 Create AuthenticationService for login/register/password reset
    - Implement login, register, forgotPassword, verifyOTP, resetPasswordWithOTP
    - Implement setCompetitionContext
    - Use repositories for data access
    - Throw domain-specific errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  
  - [ ] 14.4 Create AuthorizationService for permission checking
    - Implement role-based access control
    - Implement competition-based access control
    - Implement resource ownership validation
    - _Requirements: 1.2, 1.8_
  
  - [ ] 14.5 Write unit tests for Authentication Services
    - Test login with valid/invalid credentials
    - Test registration with duplicate email
    - Test password reset flow
    - Test OTP generation and validation
    - Test authorization checks
    - _Requirements: 15.1, 15.6, 15.7_

- [ ] 15. Implement User Services
  - [ ] 15.1 Create UserService base class with common user operations
    - Implement getProfile, updateProfile, changePassword
    - Implement account activation/deactivation
    - _Requirements: 1.5, 1.8_
  
  - [ ] 15.2 Create PlayerService extending UserService
    - Implement player-specific operations
    - Implement team assignment
    - _Requirements: 1.5, 1.8_
  
  - [ ] 15.3 Create CoachService extending UserService
    - Implement coach-specific operations
    - Implement team management
    - _Requirements: 1.5, 1.8_
  
  - [ ] 15.4 Create AdminService extending UserService
    - Implement admin-specific operations
    - Implement user management
    - _Requirements: 1.5, 1.8_
  
  - [ ] 15.5 Write unit tests for User Services
    - Test profile operations
    - Test password changes
    - Test role-specific operations
    - _Requirements: 15.1, 15.6_

- [ ] 16. Implement Competition Service
  - [ ] 16.1 Create CompetitionService for competition management
    - Implement createCompetition, updateCompetition, deleteCompetition
    - Implement getCompetitions with filtering and pagination
    - Implement competition status management
    - _Requirements: 1.5, 1.7, 1.8_
  
  - [ ] 16.2 Create RegistrationService for team registration
    - Implement registerTeam, unregisterTeam
    - Implement registration validation (age groups, gender, capacity)
    - Implement registration status tracking
    - _Requirements: 1.5, 1.7, 1.8_
  
  - [ ] 16.3 Write unit tests for Competition Services
    - Test competition CRUD operations
    - Test registration validation
    - Test business rules
    - _Requirements: 15.1, 15.6_

- [ ] 17. Implement Team Service
  - [ ] 17.1 Create TeamService for team management
    - Implement createTeam, updateTeam, deleteTeam
    - Implement addPlayer, removePlayer
    - Implement team validation (size limits, eligibility)
    - _Requirements: 1.5, 1.7, 1.8_
  
  - [ ] 17.2 Write unit tests for Team Service
    - Test team CRUD operations
    - Test player management
    - Test validation rules
    - _Requirements: 15.1, 15.6_

- [ ] 18. Implement Scoring Service
  - [ ] 18.1 Create ScoringService for score management
    - Implement submitScore, updateScore, deleteScore
    - Implement score validation
    - _Requirements: 1.5, 1.7, 1.8_
  
  - [ ] 18.2 Create CalculationService for score calculations
    - Implement average calculation
    - Implement ranking calculation
    - Implement final score computation
    - _Requirements: 1.5, 1.8_
  
  - [ ] 18.3 Write unit tests for Scoring Services
    - Test score submission and validation
    - Test calculation logic
    - Test ranking algorithms
    - _Requirements: 15.1, 15.6_

- [ ] 19. Implement Email Service
  - [ ] 19.1 Create email provider interface and adapters
    - Create IEmailProvider interface
    - Implement NodemailerAdapter
    - Implement ResendAdapter
    - _Requirements: 21.1, 21.2, 21.8_
  
  - [ ] 19.2 Create EmailService with template support
    - Implement sendEmail with retry logic
    - Implement template rendering (OTP, password reset, notifications)
    - Implement email queueing
    - Implement delivery tracking
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_
  
  - [ ] 19.3 Write unit tests for Email Service
    - Test email sending with different providers
    - Test template rendering
    - Test retry logic
    - _Requirements: 15.1, 15.6_

- [ ] 20. Implement Cache Service
  - [ ] 20.1 Create CacheService with LRU eviction
    - Implement get, set, delete, deletePattern, clear
    - Implement TTL expiration
    - Implement cache statistics (hits, misses, hit rate)
    - Implement wrap helper for caching function results
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  
  - [ ] 20.2 Write unit tests for Cache Service
    - Test cache operations
    - Test TTL expiration
    - Test LRU eviction
    - Test statistics tracking
    - _Requirements: 15.1, 15.6_

- [ ] 21. Register all services in DI container
  - Update bootstrap module to register all services
  - Wire dependencies between services
  - _Requirements: 3.4, 3.5_

- [ ] 22. Checkpoint - Verify service layer
  - Ensure all tests pass, ask the user if questions arise.


## Phase 4: Controller Refactoring (Week 8-10)

- [ ] 23. Implement request validators
  - [ ] 23.1 Create validation schemas using express-validator
    - Create auth.validator.js (login, register, password reset)
    - Create player.validator.js (create, update)
    - Create coach.validator.js (create, update)
    - Create competition.validator.js (create, update, register)
    - Create team.validator.js (create, update, add player)
    - Create scoring.validator.js (submit score, update score)
    - Create common.validator.js (ObjectId, pagination, date range)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_
  
  - [ ] 23.2 Write unit tests for validators
    - Test validation rules
    - Test error messages
    - Test sanitization
    - _Requirements: 15.1, 15.6_

- [ ] 24. Refactor Authentication Controller
  - [ ] 24.1 Update AuthController to use AuthenticationService
    - Refactor login, register, forgotPassword, verifyOTP, resetPassword endpoints
    - Use asyncHandler for error handling
    - Apply validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 19.1, 19.2_
  
  - [ ] 24.2 Write API tests for Auth Controller
    - Test all authentication endpoints
    - Verify backward compatibility
    - Test error responses
    - _Requirements: 15.3, 15.6, 19.7_

- [ ] 25. Refactor Player Controller
  - [ ] 25.1 Update PlayerController to use PlayerService
    - Refactor all player endpoints (CRUD, profile, team assignment)
    - Use asyncHandler and validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 25.2 Write API tests for Player Controller
    - Test all player endpoints
    - Verify backward compatibility
    - _Requirements: 15.3, 19.7_

- [ ] 26. Refactor Coach Controller
  - [ ] 26.1 Update CoachController to use CoachService
    - Refactor all coach endpoints (CRUD, profile, team management)
    - Use asyncHandler and validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 26.2 Write API tests for Coach Controller
    - Test all coach endpoints
    - Verify backward compatibility
    - _Requirements: 15.3, 19.7_

- [ ] 27. Refactor Admin Controller
  - [ ] 27.1 Update AdminController to use AdminService
    - Refactor all admin endpoints (CRUD, user management)
    - Use asyncHandler and validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 27.2 Write API tests for Admin Controller
    - Test all admin endpoints
    - Verify backward compatibility
    - _Requirements: 15.3, 19.7_

- [ ] 28. Refactor Competition Controller
  - [ ] 28.1 Update CompetitionController to use CompetitionService
    - Refactor all competition endpoints (CRUD, registration, status)
    - Use asyncHandler and validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 28.2 Write API tests for Competition Controller
    - Test all competition endpoints
    - Verify backward compatibility
    - _Requirements: 15.3, 19.7_

- [ ] 29. Refactor Team Controller
  - [ ] 29.1 Update TeamController to use TeamService
    - Refactor all team endpoints (CRUD, player management)
    - Use asyncHandler and validation middleware
    - Remove direct model access
    - Maintain identical API contracts
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 29.2 Write API tests for Team Controller
    - Test all team endpoints
    - Verify backward compatibility
    - _Requirements: 15.3, 19.7_

- [ ] 30. Create Scoring Controller
  - [ ] 30.1 Create ScoringController using ScoringService
    - Implement score submission, update, delete endpoints
    - Implement score retrieval with filtering
    - Use asyncHandler and validation middleware
    - _Requirements: 1.2, 1.5, 19.1, 19.2_
  
  - [ ] 30.2 Write API tests for Scoring Controller
    - Test all scoring endpoints
    - Test validation rules
    - _Requirements: 15.3, 19.7_

- [ ] 31. Implement Health Controller
  - [ ] 31.1 Create HealthController for health check endpoints
    - Implement /health/live (liveness probe)
    - Implement /health/ready (readiness probe)
    - Implement /health (detailed health status)
    - Implement /health/metrics (performance metrics)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  
  - [ ] 31.2 Write API tests for Health Controller
    - Test all health endpoints
    - Test health check responses
    - _Requirements: 15.3_

- [ ] 32. Update middleware stack
  - [ ] 32.1 Refactor authentication middleware to use AuthenticationService
    - Update token verification to use TokenService
    - Update user loading to use repositories
    - _Requirements: 1.2, 13.3, 19.1_
  
  - [ ] 32.2 Refactor authorization middleware to use AuthorizationService
    - Update permission checks to use AuthorizationService
    - Update competition context validation
    - _Requirements: 1.2, 13.3, 19.1_
  
  - [ ] 32.3 Create correlation ID middleware
    - Generate unique ID for each request
    - Attach to request object and logs
    - _Requirements: 12.8, 13.5_
  
  - [ ] 32.4 Create request timing middleware
    - Track request duration
    - Log slow requests
    - _Requirements: 13.6, 20.3_
  
  - [ ] 32.5 Update security middleware
    - Configure helmet for security headers
    - Configure CORS with environment-specific settings
    - Implement rate limiting per user and per IP
    - _Requirements: 13.7, 17.1, 17.2, 17.4, 23.4_
  
  - [ ] 32.6 Create audit logging middleware
    - Log sensitive operations
    - Include user context and correlation ID
    - _Requirements: 13.8, 17.6_

- [ ] 33. Organize route definitions
  - [ ] 33.1 Create route loader module
    - Implement route registration from DI container
    - Apply middleware in correct order
    - Group routes by domain
    - _Requirements: 14.1, 14.2, 14.3, 14.7_
  
  - [ ] 33.2 Update route files to use refactored controllers
    - Update auth.routes.js
    - Update player.routes.js, coach.routes.js, admin.routes.js
    - Update competition.routes.js, team.routes.js
    - Create scoring.routes.js
    - Create health.routes.js
    - _Requirements: 14.1, 14.2, 14.3, 14.8_

- [ ] 34. Register controllers in DI container
  - Update bootstrap module to register all controllers
  - Wire controller dependencies
  - _Requirements: 3.4, 3.5_

- [ ] 35. Checkpoint - Verify controller refactoring
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: Socket.IO Refactoring (Week 11-12)

- [ ] 36. Implement Socket.IO Manager
  - [ ] 36.1 Create SocketManager class
    - Implement Socket.IO server initialization with CORS
    - Implement authentication middleware for sockets
    - Implement connection/disconnection handling
    - Implement event handler registration
    - Implement room management
    - Implement emit helpers (emitToRoom, emitToUser, broadcast)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8_
  
  - [ ] 36.2 Write unit tests for Socket Manager
    - Test authentication middleware
    - Test event registration and handling
    - Test emit helpers
    - _Requirements: 15.1, 15.8_

- [ ] 37. Implement Socket.IO event handlers
  - [ ] 37.1 Create ScoringHandler for scoring events
    - Implement score_update event handler
    - Validate permissions using AuthorizationService
    - Delegate to ScoringService
    - Broadcast updates to competition room
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [ ] 37.2 Create NotificationHandler for notification events
    - Implement notification events
    - Validate permissions
    - Broadcast to appropriate users/rooms
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [ ] 37.3 Write tests for Socket.IO handlers
    - Test event handling
    - Test permission validation
    - Test broadcasting
    - _Requirements: 15.8_

- [ ] 38. Update services to emit Socket.IO events
  - Update ScoringService to emit score updates via SocketManager
  - Update CompetitionService to emit competition updates
  - Update TeamService to emit team updates
  - _Requirements: 4.7_

- [ ] 39. Integrate Socket.IO Manager with server startup
  - Update server.js to initialize SocketManager
  - Register event handlers
  - _Requirements: 4.1, 4.3_

- [ ] 40. Register Socket.IO components in DI container
  - Register SocketManager
  - Register event handlers
  - _Requirements: 3.4, 3.5_

- [ ] 41. Checkpoint - Verify Socket.IO refactoring
  - Ensure all tests pass, ask the user if questions arise.


## Phase 6: Performance & Monitoring (Week 13-14)

- [ ] 42. Implement caching in services
  - [ ] 42.1 Add caching to CompetitionService
    - Cache competition details by ID
    - Cache active competitions list
    - Invalidate on updates
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [ ] 42.2 Add caching to UserService
    - Cache user profiles by ID
    - Invalidate on updates
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [ ] 42.3 Add caching to TeamService
    - Cache team rosters
    - Invalidate on player changes
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [ ] 42.4 Implement cache warming at startup
    - Warm cache with frequently accessed data
    - _Requirements: 7.8_

- [ ] 43. Implement Health Monitor
  - [ ] 43.1 Create HealthMonitor class
    - Implement checkHealth with all component checks
    - Implement liveness probe
    - Implement readiness probe
    - Implement database connectivity check
    - Implement memory usage check
    - Implement email service check
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_
  
  - [ ] 43.2 Write unit tests for Health Monitor
    - Test health checks
    - Test probe endpoints
    - _Requirements: 15.1_

- [ ] 44. Implement Metrics Collector
  - [ ] 44.1 Create MetricsCollector class
    - Track request count by endpoint and status
    - Track response time percentiles (p50, p95, p99)
    - Track error rates by type
    - Track database query performance
    - Track cache hit/miss rates
    - Track active Socket.IO connections
    - Expose metrics in Prometheus format
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_
  
  - [ ] 44.2 Integrate metrics collection into middleware
    - Add metrics middleware to track requests
    - Track response times
    - Track errors
    - _Requirements: 20.2, 20.3, 20.4_
  
  - [ ] 44.3 Write unit tests for Metrics Collector
    - Test metric tracking
    - Test Prometheus format export
    - _Requirements: 15.1_

- [ ] 45. Implement Graceful Shutdown Handler
  - [ ] 45.1 Create GracefulShutdownHandler class
    - Handle SIGTERM and SIGINT signals
    - Stop accepting new connections
    - Wait for in-flight requests (max 30s)
    - Close Socket.IO connections
    - Close database connections
    - Flush logs and metrics
    - Exit with appropriate code
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  
  - [ ] 45.2 Write integration tests for Graceful Shutdown
    - Test shutdown sequence
    - Test timeout handling
    - _Requirements: 15.1_

- [ ] 46. Optimize database connection pool
  - [ ] 46.1 Configure MongoDB connection pool settings
    - Set min pool size to 10
    - Set max pool size to 100
    - Set connection timeout to 10s
    - Set socket timeout to 45s
    - Enable connection monitoring
    - Implement retry with exponential backoff
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 47. Create database migration system
  - [ ] 47.1 Implement migration runner
    - Create migration tracking collection
    - Implement up/down migration execution
    - Implement migration status command
    - Validate migration order
    - Rollback on failure
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.8_
  
  - [ ] 47.2 Create initial index migration
    - Add indexes for Player model (email, team, ageGroup+gender, isActive, createdAt)
    - Add indexes for Competition model (status, startDate, registeredTeams)
    - Add indexes for Score model (competition+player, competition+judge, createdAt)
    - Add indexes for other models
    - _Requirements: 16.1, 24.1_
  
  - [ ] 47.3 Create migration CLI commands
    - Implement npm scripts for migrate:up, migrate:down, migrate:status
    - _Requirements: 24.3_

- [ ] 48. Implement performance optimizations
  - [ ] 48.1 Add response compression middleware
    - Configure gzip compression for large payloads
    - _Requirements: 16.2_
  
  - [ ] 48.2 Optimize repository queries
    - Use .lean() for all read queries
    - Use .select() for field projection
    - Use indexes for common queries
    - _Requirements: 16.1_
  
  - [ ] 48.3 Implement request coalescing for duplicate requests
    - Prevent duplicate concurrent requests to same resource
    - _Requirements: 16.6_

- [ ] 49. Implement Feature Flag System
  - [ ] 49.1 Create FeatureFlagService
    - Load flags from configuration
    - Support boolean and percentage-based flags
    - Support user-specific and role-specific flags
    - Provide flag checking methods
    - Log flag evaluations
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.7_
  
  - [ ] 49.2 Create feature flag middleware
    - Check flags before route execution
    - Return 404 if feature disabled
    - _Requirements: 25.5_
  
  - [ ] 49.3 Write unit tests for Feature Flag System
    - Test flag evaluation
    - Test percentage rollouts
    - Test user-specific flags
    - _Requirements: 15.1_

- [ ] 50. Register monitoring components in DI container
  - Register HealthMonitor, MetricsCollector, GracefulShutdownHandler
  - _Requirements: 3.4, 3.5_

- [ ] 51. Checkpoint - Verify performance and monitoring
  - Ensure all tests pass, ask the user if questions arise.

## Phase 7: Testing & Documentation (Week 15-16)

- [ ] 52. Complete unit test coverage
  - [ ] 52.1 Achieve 80% coverage for service layer
    - Add missing tests for all services
    - Test edge cases and error conditions
    - _Requirements: 15.6_
  
  - [ ] 52.2 Achieve 80% coverage for repository layer
    - Add missing tests for all repositories
    - Test complex queries
    - _Requirements: 15.6_
  
  - [ ] 52.3 Achieve 70% coverage for controllers
    - Add missing API tests
    - Test error responses
    - _Requirements: 15.6_
  
  - [ ] 52.4 Achieve 80% coverage for utilities
    - Test all utility functions
    - _Requirements: 15.6_

- [ ] 53. Create test fixtures and helpers
  - [ ] 53.1 Create test data factories
    - Factory for creating test users (players, coaches, admins)
    - Factory for creating test competitions
    - Factory for creating test teams
    - Factory for creating test scores
    - _Requirements: 15.4_
  
  - [ ] 53.2 Create test utilities
    - Authentication helpers for tests
    - Database setup/teardown helpers
    - Mock implementations for external services
    - _Requirements: 15.5, 15.7_

- [ ] 54. Write end-to-end tests
  - [ ] 54.1 Create E2E test suite for authentication flow
    - Test complete registration and login flow
    - Test password reset flow
    - _Requirements: 15.3_
  
  - [ ] 54.2 Create E2E test suite for competition flow
    - Test competition creation and registration
    - Test scoring flow
    - Test real-time updates
    - _Requirements: 15.3_

- [ ] 55. Reorganize utility modules
  - [ ] 55.1 Group authentication utilities
    - Move OTP, token, password utilities to src/utils/auth/
    - Remove duplicates
    - _Requirements: 22.1, 22.2, 22.8_
  
  - [ ] 55.2 Group validation utilities
    - Move sanitization, score validation to src/utils/validation/
    - _Requirements: 22.1, 22.3_
  
  - [ ] 55.3 Group security utilities
    - Move account lockout, token invalidation to src/utils/security/
    - _Requirements: 22.1, 22.5_
  
  - [ ] 55.4 Group data utilities
    - Move pagination, ObjectId utils to src/utils/data/
    - _Requirements: 22.1, 22.6_

- [ ] 56. Write architecture documentation
  - [ ] 56.1 Create architecture.md
    - Document layered architecture
    - Document component responsibilities
    - Document data flow
    - Include architecture diagrams
    - _Requirements: 18.1_
  
  - [ ] 56.2 Create migration-guide.md
    - Document migration strategy
    - Provide step-by-step migration instructions
    - Include code examples for each pattern
    - Document rollback procedures
    - _Requirements: 18.2, 18.8_
  
  - [ ] 56.3 Create api-documentation.md
    - Document all service interfaces
    - Document all repository interfaces
    - Include usage examples
    - _Requirements: 18.3_
  
  - [ ] 56.4 Create dependency-injection-guide.md
    - Document DI container usage
    - Provide registration examples
    - Document lifecycle management
    - _Requirements: 18.4_
  
  - [ ] 56.5 Create testing-guide.md
    - Document testing strategy
    - Provide examples for unit, integration, and E2E tests
    - Document test utilities
    - _Requirements: 18.5_
  
  - [ ] 56.6 Create deployment-guide.md
    - Document deployment steps
    - Document environment configuration
    - Document health check endpoints
    - Document monitoring setup
    - _Requirements: 18.6_
  
  - [ ] 56.7 Create troubleshooting-guide.md
    - Document common issues and solutions
    - Document debugging techniques
    - _Requirements: 18.7_

- [ ] 57. Update existing documentation
  - [ ] 57.1 Update API_DOCUMENTATION.md with new endpoints
    - Document health check endpoints
    - Document metrics endpoint
    - Update authentication documentation
    - _Requirements: 14.4_
  
  - [ ] 57.2 Update README.md
    - Document new architecture
    - Update setup instructions
    - Document new npm scripts
    - _Requirements: 18.1_
  
  - [ ] 57.3 Create .env.example with all configuration
    - Document all environment variables
    - Provide example values
    - Group by category
    - _Requirements: 5.4, 23.8_

- [ ] 58. Implement security enhancements
  - [ ] 58.1 Implement input sanitization at service layer
    - Add sanitization to all service methods
    - _Requirements: 17.5_
  
  - [ ] 58.2 Implement token rotation
    - Rotate tokens every 24 hours
    - _Requirements: 17.7_
  
  - [ ] 58.3 Implement CSRF protection
    - Add CSRF tokens for state-changing operations
    - _Requirements: 17.3_
  
  - [ ] 58.4 Configure environment-specific settings
    - Strict CORS in production
    - Different rate limits per environment
    - Sanitized errors in production
    - _Requirements: 23.1, 23.2, 23.4, 23.5, 23.6_

- [ ] 59. Verify backward compatibility
  - [ ] 59.1 Run all existing integration tests
    - Ensure all tests pass without modification
    - _Requirements: 19.7_
  
  - [ ] 59.2 Verify API contracts
    - Test all endpoints with existing clients
    - Verify request/response formats unchanged
    - Verify authentication behavior unchanged
    - Verify Socket.IO events unchanged
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

- [ ] 60. Performance validation
  - [ ] 60.1 Run performance tests
    - Verify p95 response time < 200ms
    - Verify p99 response time < 500ms
    - Verify cache hit rate > 80%
    - Verify memory usage < 512MB
    - _Requirements: 16.8_
  
  - [ ] 60.2 Load test Socket.IO connections
    - Verify support for 1000+ concurrent connections
    - _Requirements: 16.8_

- [ ] 61. Final checkpoint - Complete refactoring
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at the end of each phase
- The refactoring maintains 100% backward compatibility throughout
- Feature flags can be used to control rollout of refactored components
- Each phase can be deployed independently with validation

## Implementation Strategy

This refactoring follows a phased approach where:

1. Phase 1-2 establish the foundation without breaking existing code
2. Phase 3 extracts business logic into testable services
3. Phase 4 updates controllers to use services while maintaining API contracts
4. Phase 5 refactors real-time features
5. Phase 6 adds production-grade features (caching, monitoring, performance)
6. Phase 7 completes testing and documentation

Each phase includes checkpoints to verify the system remains functional. The old and new implementations can coexist during migration, allowing for gradual rollout and easy rollback if issues arise.

