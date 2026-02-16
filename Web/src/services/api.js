import axios from 'axios';
import apiConfig from '../utils/apiConfig.js';
import { jwtDecode } from 'jwt-decode';

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

// Helper function to extract competition ID from JWT token
const getCompetitionIdFromToken = (token) => {
  if (!token) return null;
  
  try {
    const decoded = jwtDecode(token);
    return decoded.currentCompetition || null;
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
};

// Request interceptor to add auth token and competition context
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
      
      // Add competition context header for competition-specific endpoints
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
    } else if (error.response?.status === 403) {
      // Handle competition context errors
      const errorMessage = error.response?.data?.message || '';
      
      if (errorMessage.includes('competition') || errorMessage.includes('Competition')) {
        // Redirect to competition selection if competition context is invalid
        const currentType = getCurrentUserTypeFromURL();
        
        if (currentType) {
          // Clear the current token to force re-selection
          const token = localStorage.getItem(`${currentType}_token`);
          if (token) {
            // Keep the token but user will need to select competition again
            console.warn('Competition context invalid, redirecting to login for re-selection');
          }
          
          // Redirect to login page which will show competition selection
          window.location.href = `/${currentType}/login`;
        }
      }
    }
    return Promise.reject(error);
  }
);

// Player API
export const playerAPI = {
  register: (data) => api.post('/players/register', data),
  login: (data) => api.post('/players/login', data),
  getProfile: () => api.get('/players/profile'),
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
  createTeam: (data) => api.post('/coaches/team', data),
  getTeams: () => api.get('/coaches/teams'),
  getOpenCompetitions: () => api.get('/coaches/competitions/open'),
  selectCompetition: (data) => api.post('/coaches/select-competition', data),
  registerTeamForCompetition: (teamId, competitionId) => api.post(`/coaches/team/${teamId}/register-competition`, { competitionId }),
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
  removeAdminFromCompetition: (id, adminId) => api.delete(`/superadmin/competitions/${id}/admins/${adminId}`)
};

// Auth API
export const authAPI = {
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  getAssignedCompetitions: () => api.get('/auth/competitions/assigned'),
  setCompetition: (competitionId) => api.post('/auth/set-competition', { competitionId }),
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
