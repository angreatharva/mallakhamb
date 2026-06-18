import api from '../api-client.js';
import { createAdminAPI } from './admin.api.js';

export const superAdminAPI = {
  ...createAdminAPI('/superadmin'),
  getDashboard: (params) => api.get('/superadmin/dashboard', { params }),
  getSystemStats: () => api.get('/superadmin/stats'),
  getAllAdmins: () => api.get('/superadmin/admins'),
  createAdmin: (data) => api.post('/superadmin/admins', data),
  updateAdmin: (adminId, data) => api.put(`/superadmin/admins/${adminId}`, data),
  deleteAdmin: (adminId) => api.delete(`/superadmin/admins/${adminId}`),
  getAllCoaches: () => api.get('/superadmin/coaches'),
  updateCoachStatus: (coachId, data) => api.put(`/superadmin/coaches/${coachId}/status`, data),
  deleteTeam: (teamId) => api.delete(`/superadmin/teams/${teamId}`),
  deleteJudge: (judgeId) => api.delete(`/superadmin/judges/${judgeId}`),
  createCompetition: (data) => api.post('/superadmin/competitions', data),
  getAllCompetitions: (params) => api.get('/superadmin/competitions', { params }),
  getCompetitionById: (id) => api.get(`/superadmin/competitions/${id}`),
  updateCompetition: (id, data) => api.put(`/superadmin/competitions/${id}`, data),
  deleteCompetition: (id) => api.delete(`/superadmin/competitions/${id}`),
  assignAdminToCompetition: (id, data) => api.post(`/superadmin/competitions/${id}/admins`, data),
  removeAdminFromCompetition: (id, adminId) => api.delete(`/superadmin/competitions/${id}/admins/${adminId}`),
  getAllTeams: (params) => api.get('/superadmin/teams', { params }),
  getTeamDetails: (teamId, params) => api.get(`/superadmin/teams/${teamId}`, { params }),
  addPlayerToTeam: (data) => api.post('/superadmin/players/add', data),
  createPlayerPaymentOrder: (data) => api.post('/superadmin/players/payment/create', data),
  verifyPlayerPaymentAndAdd: (data) => {
    return api.post('/superadmin/players/payment/verify', data);
  },
};
