# Socket.IO Manager

This directory contains the Socket.IO implementation for real-time communication in the Mallakhamb Competition Management System.

## Architecture

The Socket.IO implementation follows a clean, layered architecture:

```
socket/
├── socket.manager.js          # Core Socket.IO server management
├── events/
│   └── event-types.js         # Event type constants
└── handlers/
    ├── scoring.handler.js     # Scoring event handlers
    └── notification.handler.js # Notification event handlers
```

## Components

### SocketManager

The `SocketManager` class is the core component that manages the Socket.IO server lifecycle.

**Responsibilities:**
- Initialize Socket.IO server with CORS configuration
- Handle authentication via JWT tokens
- Manage socket connections and disconnections
- Register and execute event handlers
- Provide room management utilities
- Provide emit helpers for broadcasting events

**Key Methods:**
- `initialize()` - Initialize Socket.IO server
- `registerEventHandler(eventName, handler)` - Register event handler
- `joinRoom(socket, roomId, validator)` - Join room with optional validation
- `leaveRoom(socket, roomId)` - Leave room
- `emitToRoom(roomId, eventName, data)` - Emit to specific room
- `emitToUser(userId, eventName, data)` - Emit to specific user
- `broadcast(eventName, data)` - Broadcast to all clients

### Event Handlers

#### ScoringHandler

Handles real-time scoring events during competitions.

**Events:**
- `join_scoring_room` - Join a scoring room
- `leave_scoring_room` - Leave a scoring room
- `score_update` - Real-time score updates from judges
- `scores_saved` - Notification when scores are saved

**Authorization:**
- Judges can update scores in their assigned competition
- Admins and superadmins can save scores in any competition
- Coaches and players can view but not modify scores

#### NotificationHandler

Handles real-time notifications and updates.

**Methods:**
- `sendToUser(userId, notification)` - Send notification to specific user
- `sendToCompetition(competitionId, notification)` - Send to all users in competition
- `broadcastCompetitionUpdate(competitionId, update)` - Broadcast competition updates
- `broadcastTeamUpdate(teamId, update)` - Broadcast team updates
- `broadcastPlayerUpdate(playerId, update)` - Send player-specific updates

## Usage

### Initialization

The Socket.IO manager is initialized during server startup via the bootstrap module:

```javascript
const { initializeSocketIO } = require('./infrastructure/bootstrap');

// After HTTP server is created
const httpServer = http.createServer(app);

// Initialize Socket.IO
const socketManager = initializeSocketIO(httpServer);
```

### Client Connection

Clients connect to the Socket.IO server with JWT authentication:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### Joining Scoring Rooms

```javascript
// Join a scoring room
socket.emit('join_scoring_room', {
  roomId: 'comp-123_male_u12_individual'
});

// Listen for room joined confirmation
socket.on('room_joined', (data) => {
  console.log('Joined room:', data.roomId);
});

// Listen for score updates
socket.on('score_updated', (data) => {
  console.log('Score updated:', data);
  // Update UI with new score
});
```

### Sending Score Updates (Judges Only)

```javascript
// Send score update
socket.emit('score_update', {
  roomId: 'comp-123_male_u12_individual',
  playerId: 'player-456',
  judgeType: 'technical',
  score: 8.5
});
```

### Saving Scores

```javascript
// Save scores
socket.emit('scores_saved', {
  roomId: 'comp-123_male_u12_individual',
  playerId: 'player-456',
  scores: {
    technical: 8.5,
    artistic: 9.0
  }
});

// Listen for save confirmation
socket.on('scores_saved_notification', (data) => {
  console.log('Scores saved:', data);
});
```

### Receiving Notifications

```javascript
// Listen for general notifications
socket.on('notification', (notification) => {
  console.log('Notification:', notification);
  // Display notification to user
});

// Listen for competition updates
socket.on('competition_update', (update) => {
  console.log('Competition updated:', update);
  // Update competition UI
});

// Listen for team updates
socket.on('team_update', (update) => {
  console.log('Team updated:', update);
  // Update team UI
});
```

## Room Naming Convention

Rooms follow a consistent naming pattern:

- **Scoring rooms**: `{competitionId}_{gender}_{ageGroup}_{competitionType}`
  - Example: `comp-123_male_u12_individual`
  
- **Competition rooms**: `competition_{competitionId}`
  - Example: `competition_comp-123`
  
- **Team rooms**: `team_{teamId}`
  - Example: `team_team-456`

## Authentication

All socket connections require JWT authentication:

1. Client provides JWT token in `auth.token` during connection
2. Server verifies token using `TokenService`
3. User information is attached to socket: `userId`, `userType`, `competitionId`
4. Invalid tokens result in connection rejection

## Authorization

Event handlers validate permissions before processing:

- **Judges**: Can update scores in their assigned competition
- **Admins**: Can manage competitions and save scores
- **Superadmins**: Full access to all operations
- **Coaches**: Can view scores but not modify
- **Players**: Can view their own scores

## Error Handling

Errors are emitted to the client via the `error` event:

```javascript
socket.on('error', (error) => {
  console.error('Error:', error.message);
  // Display error to user
});
```

## Metrics

The Socket.IO manager tracks metrics via `MetricsCollector`:

- Active connection count
- Total events processed
- Connection/disconnection events

## Testing

Comprehensive unit tests are provided:

```bash
# Run all Socket.IO tests
npm test -- src/socket

# Run specific test files
npm test -- src/socket/socket.manager.test.js
npm test -- src/socket/handlers/scoring.handler.test.js
npm test -- src/socket/handlers/notification.handler.test.js
```

## Integration with Services

Services can emit Socket.IO events by resolving the `socketManager` from the DI container:

```javascript
class ScoringService {
  constructor(scoreRepository, socketManager, logger) {
    this.scoreRepository = scoreRepository;
    this.socketManager = socketManager;
    this.logger = logger;
  }

  async submitScore(scoreData) {
    // Save score to database
    const score = await this.scoreRepository.create(scoreData);

    // Emit real-time update
    this.socketManager.emitToRoom(
      scoreData.roomId,
      'score_updated',
      score
    );

    return score;
  }
}
```

## Requirements Fulfilled

This implementation fulfills the following requirements from the spec:

- **4.1**: Socket.IO server initialization with CORS
- **4.2**: Authentication middleware for sockets
- **4.3**: Event handler registration
- **4.4**: Connection/disconnection handling
- **4.6**: Room management
- **4.7**: Emit helpers (emitToRoom, emitToUser, broadcast)
- **4.8**: Clean API for services to use
- **15.1**: Unit tests for Socket.IO components
- **15.8**: Socket.IO testing utilities

## Future Enhancements

Potential improvements for future iterations:

1. **Redis Adapter**: For horizontal scaling across multiple server instances
2. **Presence System**: Track online/offline status of users
3. **Typing Indicators**: Show when judges are entering scores
4. **Message Queue**: Persist events for offline users
5. **Rate Limiting**: Prevent abuse of real-time events
6. **Compression**: Enable Socket.IO compression for large payloads
