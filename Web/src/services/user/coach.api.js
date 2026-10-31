import api from '../api-client.js';

export const coachAPI = {
  register: (data) => api.post('/coaches/register', data),
  login: (data) => api.post('/coaches/login', data),
  getProfile: () => api.get('/coaches/profile'),
  getStatus: () => api.get('/coaches/status'),
  createTeam: (data) => api.post('/coaches/team', data),
  getTeams: () => api.get('/coaches/teams'),
  // Co-coaches of the coach's team; only the main coach removes one.
  getCoCoaches: () => api.get('/coaches/co-coaches'),
  removeCoCoach: (coachId) => api.post(`/coaches/co-coaches/${coachId}/remove`),
  getOpenCompetitions: () => api.get('/coaches/competitions/open'),
  selectCompetition: (data) => api.post('/coaches/select-competition', data),
  registerTeamForCompetition: (teamId, competitionId) => api.post(`/coaches/team/${teamId}/register-competition`, { competitionId }),
  getDashboard: () => api.get('/coaches/dashboard'),
  /** This coach's players who qualified for Competition II / III in the meet in context. */
  getFinals: () => api.get('/coaches/finals'),
  // Resets and email additions from players on this coach's teams who have no email.
  accountRequests: {
    list: () => api.get('/coaches/account-requests'),
    approve: (id) => api.post(`/coaches/account-requests/${id}/approve`),
    reject: (id) => api.post(`/coaches/account-requests/${id}/reject`),
  },
  // Players with no email, registered by the coach. The default password is
  // readable: the coach hands it to the players they register.
  playerDefaultPassword: {
    get: () => api.get('/coaches/player-default-password'),
    set: (password, currentPassword) => api.put('/coaches/player-default-password', { password, currentPassword }),
  },
  registerPlayer: (data) => api.post('/coaches/players', data),
  searchPlayers: (query) => api.get(`/coaches/search-players?query=${query}`),
  addPlayerToAgeGroup: (data) => api.post('/coaches/add-player', data),
  removePlayerFromAgeGroup: (playerId) => api.delete(`/coaches/remove-player/${playerId}`),
  createPaymentOrder: () => api.post('/coaches/payments/create-order'),
  verifyPaymentAndSubmit: (data) => api.post('/coaches/payments/verify-and-submit', data),
  // Two steps on purpose: the first only quotes, so a coach sees the discounted
  // total before committing to a submission they cannot undo. The second
  // re-checks the code from scratch — the quote grants nothing.
  validateDiscountCode: (discountCode) => api.post('/coaches/payments/discount/validate', { discountCode }),
  redeemDiscountCode: (discountCode) => api.post('/coaches/payments/discount/redeem', { discountCode }),
};
