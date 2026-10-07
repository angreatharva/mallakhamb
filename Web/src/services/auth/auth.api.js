import api from '../api-client.js';

export const authAPI = {
  /**
   * The authenticated principal, resolved from the httpOnly cookie.
   * Used to rehydrate a session when sessionStorage is empty but the cookie
   * is still valid — a fresh tab, or storage that was evicted (MED-W1).
   */
  me: () => api.get('/auth/me'),
  // userType picks the account when one email owns several (player, coach,
  // admin, judge); omitted, the server takes the first match.
  forgotPassword: (email, userType) => api.post('/auth/forgot-password', { email, userType }),
  verifyOTP: (email, otp, userType) => api.post('/auth/verify-otp', { email, otp, userType }),
  resetPasswordWithOTP: (email, otp, password, userType) => api.post('/auth/reset-password-otp', { email, otp, password, userType }),
  getAssignedCompetitions: () => api.get('/auth/competitions/assigned'),
  setCompetition: (competitionId) => api.post('/auth/set-competition', { competitionId }),
};
