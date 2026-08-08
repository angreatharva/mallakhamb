import api from '../api-client.js';

export const authAPI = {
  /**
   * The authenticated principal, resolved from the httpOnly cookie.
   * Used to rehydrate a session when sessionStorage is empty but the cookie
   * is still valid — a fresh tab, or storage that was evicted (MED-W1).
   */
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  verifyOTP: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
  resetPasswordWithOTP: (email, otp, password) => api.post('/auth/reset-password-otp', { email, otp, password }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  getAssignedCompetitions: () => api.get('/auth/competitions/assigned'),
  setCompetition: (competitionId) => api.post('/auth/set-competition', { competitionId }),
};
