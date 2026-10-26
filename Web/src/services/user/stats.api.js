import api from '../api-client.js';

/**
 * The profile Stats tabs and the admin Judge fairness board
 * (Server/src/routes/stats.routes.js). Every call answers for the signed-in
 * principal — the server never takes "whose stats" from the request.
 */
export const statsAPI = {
  /** The signed-in player's published performances. */
  player: () => api.get('/stats/player'),
  /** Every athlete on the signed-in coach's teams. */
  coach: () => api.get('/stats/coach'),
  /** The signed-in judge's marking pattern; `competition` narrows it to one meet. */
  judge: (competition) => api.get('/stats/judge', { params: competition ? { competition } : {} }),
  /** Judge × team leans. Admins must name one of their meets; a super admin may omit it. */
  judgeFairness: (competition) => api.get('/stats/judge-fairness', { params: competition ? { competition } : {} }),
};
