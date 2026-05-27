import api from '../api-client.js';

export const createAdminAPI = (basePath = '/admin') => ({
  register: (data) => api.post(`${basePath}/register`, data),
  login: (data) => api.post(`${basePath}/login`, data),
  getProfile: () => api.get(`${basePath}/profile`),
  getDashboard: () => api.get(`${basePath}/dashboard`),
  getAllTeams: (params) => api.get(`${basePath}/teams`, { params }),
  getTeamDetails: (teamId, params) => api.get(`${basePath}/teams/${teamId}`, { params }),
  getAllPlayers: (params) => api.get(`${basePath}/players`, { params }),
  addScore: (data) => api.post(`${basePath}/scores`, data),
  getTeamScores: (params) => api.get(`${basePath}/scores/team`, { params }),
  getIndividualScores: (params) => api.get(`${basePath}/scores/individual`, { params }),
  getTeamRankings: (params) => api.get(`${basePath}/scores/team-rankings`, { params }),
  getSubmittedTeams: (params) => api.get(`${basePath}/teams/submitted`, { params }),
  saveJudges: (data) => api.post(`${basePath}/judges/bulk`, data),
  getJudges: (params) => api.get(`${basePath}/judges`, { params }),
  getAllJudgesSummary: (params) => api.get(`${basePath}/judges/summary`, { params }),
  updateJudge: (judgeId, data) => api.put(`${basePath}/judges/${judgeId}`, data),
  createSingleJudge: (data) => api.post(`${basePath}/judges`, data),
  deleteJudge: (judgeId) => api.delete(`${basePath}/judges/${judgeId}`),
  startAgeGroup: (data) => api.post(`${basePath}/age-groups/start`, data),
  saveScores: (data) => api.post(`${basePath}/scores/save`, data),
  unlockScores: (scoreId) => api.put(`${basePath}/scores/${scoreId}/unlock`),
  getTransactions: (params) => api.get(`${basePath}/transactions`, { params }),
});

export const adminAPI = createAdminAPI('/admin');
