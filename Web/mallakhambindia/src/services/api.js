import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper function to get current user type from URL
const getCurrentUserTypeFromURL = () => {
  const path = window.location.pathname;
  if (path.startsWith('/player')) return 'player';
  if (path.startsWith('/coach')) return 'coach';
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
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Admin API
export const adminAPI = {
  register: (data) => api.post('/admin/register', data),
  login: (data) => api.post('/admin/login', data),
  getProfile: () => api.get('/admin/profile'),
  getDashboard: () => api.get('/admin/dashboard'),
  getAllTeams: (params) => api.get('/admin/teams', { params }),
  getTeamDetails: (teamId) => api.get(`/admin/teams/${teamId}`),
  getAllPlayers: (params) => api.get('/admin/players', { params }),
  addScore: (data) => api.post('/admin/scores', data),
  getTeamScores: (params) => api.get('/admin/scores/teams', { params }),
  getIndividualScores: (params) => api.get('/admin/scores/individual', { params }),
  getTeamRankings: (params) => api.get('/admin/scores/team-rankings', { params }),
  getSubmittedTeams: (params) => api.get('/admin/submitted-teams', { params }),
  saveJudges: (data) => api.post('/admin/judges', data),
  getJudges: (params) => api.get('/admin/judges', { params }),
  updateJudge: (judgeId, data) => api.put(`/admin/judges/${judgeId}`, data),
  createSingleJudge: (data) => api.post('/admin/judges/single', data),
  saveScores: (data) => api.post('/admin/scores/save', data),
  updateScores: (scoreId, data) => api.put(`/admin/scores/${scoreId}`, data),
  unlockScores: (scoreId) => api.put(`/admin/scores/${scoreId}/unlock`),
};

// Public Judge API (no authentication required)
export const judgeAPI = {
  getJudges: (params) => publicApi.get('/public/judges', { params }),
  getSubmittedTeams: (params) => publicApi.get('/public/submitted-teams', { params }),
  saveScore: (data) => publicApi.post('/public/save-score', data),
};

export default api;
