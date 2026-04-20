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
  SCORE_UPDATE_REQUEST: 'score_update_request',
  SCORE_UPDATE_SUCCESS: 'score_update_success',
  SCORE_SAVED: 'score_saved',
  SCORE_ERROR: 'score_error',
  SCORES_SAVED: 'scores_saved',
  SCORES_SAVED_NOTIFICATION: 'scores_saved_notification',

  SCORE_SUBMITTED: 'score_submitted',
  SCORE_DELETED: 'score_deleted',

  // Notification events
  NOTIFICATION: 'notification',
  COMPETITION_UPDATE: 'competition_update',
  TEAM_UPDATE: 'team_update',
  PLAYER_UPDATE: 'player_update'
  ,
  TEAM_CREATED: 'team_created',
  TEAM_UPDATED: 'team_updated',
  TEAM_PLAYER_ADDED: 'team_player_added',
  TEAM_PLAYER_REMOVED: 'team_player_removed',
  COMPETITION_CREATED: 'competition_created',
  COMPETITION_UPDATED: 'competition_updated',
  COMPETITION_STATUS_UPDATED: 'competition_status_updated',
  TEAM_APPROVED: 'team_approved',
  TEAM_REJECTED: 'team_rejected',
  PLAYER_STATUS_UPDATED: 'player_status_updated',
  SCORE_SAVED_REST: 'score_saved',
  SCORES_UNLOCKED: 'scores_unlocked',
  SCORES_LOCKED: 'scores_locked',
  AGE_GROUP_STARTED: 'age_group_started',
  AGE_GROUP_ENDED: 'age_group_ended'
};
