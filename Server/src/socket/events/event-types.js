/**
 * Socket.IO Event Types
 * 
 * Centralized constants for all Socket.IO events
 */

module.exports = {
  // Connection events
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Room management events
  JOIN_SCORING_ROOM: 'join_scoring_room',
  LEAVE_SCORING_ROOM: 'leave_scoring_room',
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',

  // Scoring events
  SCORE_UPDATE: 'score_update',
  SCORE_UPDATED: 'score_updated',
  SCORES_SAVED: 'scores_saved',
  SCORES_SAVED_NOTIFICATION: 'scores_saved_notification',

  // Notification events
  NOTIFICATION: 'notification',
  COMPETITION_UPDATE: 'competition_update',
  TEAM_UPDATE: 'team_update',
  PLAYER_UPDATE: 'player_update'
};
