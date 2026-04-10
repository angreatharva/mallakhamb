import axios from 'axios';
import apiConfig from '../utils/apiConfig.js';
import { isTokenExpired, getCompetitionIdFromToken } from '../utils/tokenUtils.js';
import { secureStorage } from '../utils/secureStorage.js';
import { apiCache, clearCachePattern } from '../utils/apiCache.js';
import { logger } from '../utils/logger.js';
import { setupInterceptors } from './apiInterceptor.js';

logger.log('🏠 Using API URL:', apiConfig.getBaseUrl());

// Create axios instance with base URL from environment
const api = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

// Helper function to get current user type from URL
const getCurrentUserTypeFromURL = () => {
  const path = window.location.pathname;
  if (path.startsWith('/player')) return 'player';
  if (path.startsWith('/coach')) return 'coach';
  if (path.startsWith('/judge')) return 'judge';
  if (path.startsWith('/superadmin')) return 'superadmin';
  if (path.startsWith('/admin')) return 'admin';
  return null;
};

// Helper function to get token with secure storage
const getToken = (userType) => {
  if (userType) {
    return secureStorage.getItem(`${userType}_token`);
  }
  return secureStorage.getItem('token');
};

// Request interceptor to add auth token, validate expiry, and check cache
api.interceptors.request.use(
  (config) => {
    // Check cache for GET requests
    if (config.method === 'get' && !config.skipCache) {
      const cached = apiCache.get(config.url, config.params);
      if (cached) {
        return Promise.reject({
          config,
          response: { data: cached },
          cached: true,
        });
      }
    }

    const currentType = getCurrentUserTypeFromURL();
    let token = getToken(currentType);

    // Check token expiry before making request
    if (token && isTokenExpired(token)) {
      // Clear expired token
      if (currentType) {
        secureStorage.removeItem(`${currentType}_token`);
        secureStorage.removeItem(`${currentType}_user`);
      }
      secureStorage.removeItem('token');
      secureStorage.removeItem('user');

      // Redirect to login
      window.location.href = '/';
      return Promise.reject(new Error('Token expired'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;

      // Add competition context header
      const competitionId = getCompetitionIdFromToken(token);
      if (competitionId) {
        config.headers['x-competition-id'] = competitionId;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and cache responses
api.interceptors.response.use(
  (response) => {
    // Cache GET responses
    if (response.config.method === 'get' && !response.config.skipCache) {
      apiCache.set(response.config.url, response.config.params, response.data);
    }
    return response;
  },
  (error) => {
    // Handle cached responses
    if (error.cached) {
      return Promise.resolve(error.response);
    }

    if (error.response?.status === 401) {
      const currentType = getCurrentUserTypeFromURL();

      if (currentType) {
        secureStorage.removeItem(`${currentType}_token`);
        secureStorage.removeItem(`${currentType}_user`);
      }

      // Also clean up legacy storage
      secureStorage.removeItem('token');
      secureStorage.removeItem('user');
      secureStorage.removeItem('userType');

      window.location.href = '/';
    } else if (error.response?.status === 403) {
      // Handle competition context errors
      const errorMessage = error.response?.data?.message || '';

      if (errorMessage.includes('competition') || errorMessage.includes('Competition')) {
        const currentType = getCurrentUserTypeFromURL();

        if (currentType) {
          const token = getToken(currentType);
          if (token) {
            logger.warn('Competition context invalid, redirecting to login for re-selection');
          }

          // Super admin routes can legitimately operate without explicit competition context.
          // Avoid forcing a login redirect for these users on competition-related 403s.
          if (currentType !== 'superadmin') {
            window.location.href = `/${currentType}/login`;
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

setupInterceptors(api);

// Player API
export const playerAPI = {
  register: (data) => api.post('/players/register', data),
  login: (data) => api.post('/players/login', data),
  getProfile: () => api.get('/players/profile'),
  getTeam: () => api.get('/players/team'),
  // Join a team in the current competition
  updateTeam: (data) => api.post('/players/team/join', data),
  getTeams: () => api.get('/players/teams'),
};

// Coach API
export const coachAPI = {
  register: (data) => api.post('/coaches/register', data),
  login: (data) => api.post('/coaches/login', data),
  getProfile: () => api.get('/coaches/profile'),
  getStatus: () => api.get('/coaches/status'),
  createTeam: (data) => {
    clearCachePattern('/coaches');
    return api.post('/coaches/team', data);
  },
  getTeams: () => api.get('/coaches/teams'),
  getOpenCompetitions: () => api.get('/coaches/competitions/open'),
  selectCompetition: (data) => api.post('/coaches/select-competition', data),
  registerTeamForCompetition: (teamId, competitionId) => {
    clearCachePattern('/coaches');
    return api.post(`/coaches/team/${teamId}/register-competition`, { competitionId });
  },
  getDashboard: () => api.get('/coaches/dashboard'),
  searchPlayers: (query) => api.get(`/coaches/search-players?query=${query}`),
  addPlayerToAgeGroup: (data) => {
    clearCachePattern('/coaches/dashboard');
    return api.post('/coaches/add-player', data);
  },
  removePlayerFromAgeGroup: (playerId) => {
    clearCachePattern('/coaches/dashboard');
    return api.delete(`/coaches/remove-player/${playerId}`);
  },
  createPaymentOrder: () => {
    clearCachePattern('/coaches');
    return api.post('/coaches/payments/create-order');
  },
  verifyPaymentAndSubmit: (data) => {
    clearCachePattern('/coaches');
    return api.post('/coaches/payments/verify-and-submit', data);
  },
};

// Team API
export const teamAPI = {
  getAll: () => api.get('/teams'),
  getById: (id) => api.get(`/teams/${id}`),
  update: (id, data) => api.put(`/teams/${id}`, data),
  delete: (id) => api.delete(`/teams/${id}`),
  getStats: (id) => api.get(`/teams/${id}/stats`),
};

// Create a separate API instance for public judge endpoints (no auth required)
const publicApi = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

// Factory function to create admin API with configurable base path
const createAdminAPI = (basePath = '/admin') => ({
  register: (data) => api.post(`${basePath}/register`, data),
  login: (data) => api.post(`${basePath}/login`, data),
  getProfile: () => api.get(`${basePath}/profile`),
  getDashboard: () => api.get(`${basePath}/dashboard`),
  getAllTeams: (params) => api.get(`${basePath}/teams`, { params }),
  getTeamDetails: (teamId) => api.get(`${basePath}/teams/${teamId}`),
  getAllPlayers: (params) => api.get(`${basePath}/players`, { params }),
  addScore: (data) => api.post(`${basePath}/scores`, data),
  getTeamScores: (params) => api.get(`${basePath}/scores/teams`, { params }),
  getIndividualScores: (params) => api.get(`${basePath}/scores/individual`, { params }),
  getTeamRankings: (params) => api.get(`${basePath}/scores/team-rankings`, { params }),
  getSubmittedTeams: (params) => api.get(`${basePath}/submitted-teams`, { params }),
  saveJudges: (data) => api.post(`${basePath}/judges`, data),
  getJudges: (params) => api.get(`${basePath}/judges`, { params }),
  getAllJudgesSummary: () => api.get(`${basePath}/judges/summary`),
  updateJudge: (judgeId, data) => api.put(`${basePath}/judges/${judgeId}`, data),
  createSingleJudge: (data) => api.post(`${basePath}/judges/single`, data),
  deleteJudge: (judgeId) => api.delete(`${basePath}/judges/${judgeId}`),
  startAgeGroup: (data) => api.post(`${basePath}/competition/age-group/start`, data),
  saveScores: (data) => api.post(`${basePath}/scores/save`, data),
  unlockScores: (scoreId) => api.put(`${basePath}/scores/${scoreId}/unlock`),
  getTransactions: (params) => api.get(`${basePath}/transactions`, { params }),
});

// Admin API with base path /admin (relative to baseURL which already includes /api)
export const adminAPI = createAdminAPI('/admin');

// Super Admin API with base path /superadmin (relative to baseURL which already includes /api)
export const superAdminAPI = {
  ...createAdminAPI('/superadmin'),
  // Override getDashboard to support query params
  getDashboard: (params) => api.get('/superadmin/dashboard', { params }),
  // Super Admin specific endpoints
  getSystemStats: () => api.get('/superadmin/system-stats'),
  getAllAdmins: () => api.get('/superadmin/admins'),
  createAdmin: (data) => api.post('/superadmin/admins', data),
  updateAdmin: (adminId, data) => api.put(`/superadmin/admins/${adminId}`, data),
  deleteAdmin: (adminId) => api.delete(`/superadmin/admins/${adminId}`),
  getAllCoaches: () => api.get('/superadmin/coaches'),
  updateCoachStatus: (coachId, data) => api.put(`/superadmin/coaches/${coachId}/status`, data),
  deleteTeam: (teamId) => api.delete(`/superadmin/teams/${teamId}`),
  deleteJudge: (judgeId) => api.delete(`/superadmin/judges/${judgeId}`),
  // Competition management endpoints
  createCompetition: (data) => api.post('/superadmin/competitions', data),
  getAllCompetitions: (params) => api.get('/superadmin/competitions', { params }),
  getCompetitionById: (id) => api.get(`/superadmin/competitions/${id}`),
  updateCompetition: (id, data) => api.put(`/superadmin/competitions/${id}`, data),
  deleteCompetition: (id) => api.delete(`/superadmin/competitions/${id}`),
  assignAdminToCompetition: (id, data) => api.post(`/superadmin/competitions/${id}/admins`, data),
  removeAdminFromCompetition: (id, adminId) =>
    api.delete(`/superadmin/competitions/${id}/admins/${adminId}`),
  // Team and Player management
  getAllTeams: (params) => api.get('/superadmin/teams', { params }),
  addPlayerToTeam: (data) => api.post('/superadmin/players/add', data),
};

// Auth API
export const authAPI = {
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  verifyOTP: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
  resetPasswordWithOTP: (email, otp, password) =>
    api.post('/auth/reset-password-otp', { email, otp, password }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  getAssignedCompetitions: () => api.get('/auth/competitions/assigned'),
  setCompetition: (competitionId) => api.post('/auth/set-competition', { competitionId }),
};

// Public Judge API (no authentication required)
export const judgeAPI = {
  getCompetitions: () => publicApi.get('/public/competitions'),
  getJudges: (params) => publicApi.get('/public/judges', { params }),
  getSubmittedTeams: (params) => publicApi.get('/public/submitted-teams', { params }),
  saveScore: (data) => publicApi.post('/public/save-score', data),
};

// Public API for viewing scores (no authentication required)
export const publicAPI = {
  getTeams: () => publicApi.get('/public/teams'),
  getScores: (params) => publicApi.get('/public/scores', { params }),
};

export default api;
