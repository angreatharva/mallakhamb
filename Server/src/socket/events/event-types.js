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
  // A socket auto-joins its own competition's room at connect (from the JWT's
  // competitionId claim — see socket.manager.js:handleConnection). These two
  // are for a socket whose context wasn't known at handshake, or that changes
  // competition mid-session without reconnecting (e.g. right after
  // POST /auth/set-competition mints a new token but the socket is still the
  // old one).
  JOIN_COMPETITION_ROOM: 'join_competition_room',
  LEAVE_COMPETITION_ROOM: 'leave_competition_room',
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',

  // Scoring events
  SCORE_UPDATE: 'score_update',
  SCORE_UPDATED: 'score_updated',
  // SCORE_UPDATE_REQUEST / SCORE_UPDATE_SUCCESS / SCORE_ERROR are gone with the
  // `score_update_request` handler they belonged to — see scoring.handler.js.
  SCORE_SAVED: 'score_saved',
  SCORES_SAVED: 'scores_saved',
  SCORES_SAVED_NOTIFICATION: 'scores_saved_notification',

  SCORE_SUBMITTED: 'score_submitted',
  SCORE_DELETED: 'score_deleted',

  // Running order (lot draw + Senior Judge / Scorer drag sequence).
  // Broadcast into the category's scoring room so every judge on the panel
  // re-sorts without a refresh.
  PERFORMANCE_ORDER_UPDATED: 'performance_order_updated',

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
