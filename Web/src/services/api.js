import axios from 'axios';
import apiConfig from '../utils/apiConfig.js';

console.log('🏠 Using API URL:', apiConfig.getBaseUrl());

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
  if (path.startsWith('/superadmin')) return 'superadmin';
  if (path.startsWith('/admin')) return 'admin';
  return null;
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const currentType = getCurrentUserTypeFromURL();
    let token = null;

    if (currentType) {
      token = localStorage.getItem(`${currentType}_token`);
    }

    // Fallback to legacy token if type-specific token not found
    if (!token) {
      token = localStorage.getItem('token');
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentType = getCurrentUserTypeFromURL();

      if (currentType) {
        localStorage.removeItem(`${currentType}_token`);
        localStorage.removeItem(`${currentType}_user`);
      }

      // Also clean up legacy storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userType');

      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Player API
export const playerAPI = {
  register: (data) => api.post('/players/register', data),
  login: (data) => api.post('/players/login', data),
  getProfile: () => api.get('/players/profile'),
  updateTeam: (data) => api.put('/players/team', data),
  getTeams: () => api.get('/players/teams'),
};

// Coach API
export const coachAPI = {
  register: (data) => api.post('/coaches/register', data),
  login: (data) => api.post('/coaches/login', data),
  getProfile: () => api.get('/coaches/profile'),
  createTeam: (data) => api.post('/coaches/team', data),
  getDashboard: () => api.get('/coaches/dashboard'),
  searchPlayers: (query) => api.get(`/coaches/search-players?query=${query}`),
  addPlayerToAgeGroup: (data) => api.post('/coaches/add-player', data),
  removePlayerFromAgeGroup: (playerId) => api.delete(`/coaches/remove-player/${playerId}`),
  submitTeam: () => api.post('/coaches/submit-team'),
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
  updateJudge: (judgeId, data) => api.put(`${basePath}/judges/${judgeId}`, data),
  createSingleJudge: (data) => api.post(`${basePath}/judges/single`, data),
  saveScores: (data) => api.post(`${basePath}/scores/save`, data),
  unlockScores: (scoreId) => api.put(`${basePath}/scores/${scoreId}/unlock`),
});

// Admin API with base path /admin (relative to baseURL which already includes /api)
export const adminAPI = createAdminAPI('/admin');

// Super Admin API with base path /superadmin (relative to baseURL which already includes /api)
export const superAdminAPI = {
  ...createAdminAPI('/superadmin'),
  // Super Admin specific endpoints
  getSystemStats: () => api.get('/superadmin/system-stats'),
  getAllAdmins: () => api.get('/superadmin/admins'),
  createAdmin: (data) => api.post('/superadmin/admins', data),
  updateAdmin: (adminId, data) => api.put(`/superadmin/admins/${adminId}`, data),
  deleteAdmin: (adminId) => api.delete(`/superadmin/admins/${adminId}`),
  getAllCoaches: () => api.get('/superadmin/coaches'),
  updateCoachStatus: (coachId, data) => api.put(`/superadmin/coaches/${coachId}/status`, data),
  deleteTeam: (teamId) => api.delete(`/superadmin/teams/${teamId}`),
  deleteJudge: (judgeId) => api.delete(`/superadmin/judges/${judgeId}`)
};

// Auth API
export const authAPI = {
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
};

// Public Judge API (no authentication required)
export const judgeAPI = {
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
