import api from '../api-client.js';
import { createAdminAPI } from './admin.api.js';

/**
 * `register` and `getAllPlayers` are pulled off the inherited surface: the admin
 * router declares `POST /admin/register` and `GET /admin/players`, but
 * super-admin.routes.js declares neither, so inheriting them under `/superadmin`
 * only advertised endpoints that 404. Superadmins add players through
 * `addPlayerToTeam` (`POST /superadmin/players/add`) below, and admin accounts
 * are created via `createAdmin` (`POST /superadmin/admins`).
 */
const { register: _register, getAllPlayers: _getAllPlayers, ...superAdminBase } =
  createAdminAPI('/superadmin');

export const superAdminAPI = {
  ...superAdminBase,
  getDashboard: (params) => api.get('/superadmin/dashboard', { params }),
  getSystemStats: () => api.get('/superadmin/stats'),
  getAllAdmins: () => api.get('/superadmin/admins'),
  createAdmin: (data) => api.post('/superadmin/admins', data),
  updateAdmin: (adminId, data) => api.put(`/superadmin/admins/${adminId}`, data),
  deleteAdmin: (adminId) => api.delete(`/superadmin/admins/${adminId}`),
  getAllCoaches: () => api.get('/superadmin/coaches'),
  // Every open request from a player with no email (no team, or coach unreachable).
  accountRequests: {
    list: () => api.get('/superadmin/account-requests'),
    approve: (id) => api.post(`/superadmin/account-requests/${id}/approve`),
    reject: (id) => api.post(`/superadmin/account-requests/${id}/reject`),
  },
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
