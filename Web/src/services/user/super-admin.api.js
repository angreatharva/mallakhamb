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
  // Activate only: coaches cannot be deactivated (see SuperAdminManagement).
  activateCoach: (coachId) => api.put(`/superadmin/coaches/${coachId}/status`, { isActive: true }),
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
  // A player's team at each level: find, correct, conflicts, history.
  playerTeams: {
    search: (q) => api.get('/superadmin/player-teams/players', { params: { q } }),
    detail: (playerId) => api.get(`/superadmin/player-teams/players/${playerId}`),
    correct: (playerId, data) => api.post(`/superadmin/player-teams/players/${playerId}/correct`, data),
    removeEntries: (playerId, data) => api.post(`/superadmin/player-teams/players/${playerId}/remove-entries`, data),
    conflicts: () => api.get('/superadmin/player-teams/conflicts'),
    resolveConflict: (conflictId, data) => api.post(`/superadmin/player-teams/conflicts/${conflictId}/resolve`, data),
    history: (params) => api.get('/superadmin/player-teams/history', { params }),
  },
  // The owner's correction tools and History (docs/superadmin-control-plan.md).
  // Every write carries a `reason`, kept in History.
  fix: {
    history: (params) => api.get('/superadmin/history', { params }),
    undo: (logId, reason) => api.post(`/superadmin/history/${logId}/undo`, { reason }),
    deletedCompetitions: () => api.get('/superadmin/competitions-deleted'),
    restoreCompetition: (id, reason) => api.post(`/superadmin/competitions/${id}/restore`, { reason }),
    searchAccounts: (params) => api.get('/superadmin/accounts', { params }),
    getAccount: (type, id) => api.get(`/superadmin/accounts/${type}/${id}`),
    updateAccount: (type, id, data) => api.put(`/superadmin/accounts/${type}/${id}`, data),
    resetPassword: (type, id, reason) => api.post(`/superadmin/accounts/${type}/${id}/reset-password`, { reason }),
    signOut: (type, id, reason) => api.post(`/superadmin/accounts/${type}/${id}/sign-out`, { reason }),
    setActive: (type, id, isActive, reason) => api.post(`/superadmin/accounts/${type}/${id}/active`, { isActive, reason }),
    searchTeams: (q) => api.get('/superadmin/fix/teams', { params: { q } }),
    getTeam: (id) => api.get(`/superadmin/fix/teams/${id}`),
    renameTeam: (id, name, reason) => api.put(`/superadmin/fix/teams/${id}`, { name, reason }),
    deleteTeam: (id, reason) => api.post(`/superadmin/fix/teams/${id}/delete`, { reason }),
    restoreTeam: (id, reason) => api.post(`/superadmin/fix/teams/${id}/restore`, { reason }),
    changeCoach: (id, data) => api.post(`/superadmin/fix/teams/${id}/change-coach`, data),
    removeCoCoach: (id, coachId, reason) => api.post(`/superadmin/fix/teams/${id}/co-coaches/${coachId}/remove`, { reason }),
    previewTransfer: (params) => api.get('/superadmin/fix/transfer/preview', { params }),
    transfer: (data) => api.post('/superadmin/fix/transfer', data),
    listScores: (params) => api.get('/superadmin/fix/scores', { params }),
    correctScore: (scoreId, rowId, data) => api.post(`/superadmin/fix/scores/${scoreId}/rows/${rowId}`, data),
    entryTeams: (competitionId) => api.get(`/superadmin/fix/entries/${competitionId}`),
    getEntry: (competitionId, teamId) => api.get(`/superadmin/fix/entries/${competitionId}/${teamId}`),
    addEntryPlayer: (competitionId, teamId, data) => api.post(`/superadmin/fix/entries/${competitionId}/${teamId}/players`, data),
    updateEntryPlayer: (competitionId, teamId, playerId, data) => api.put(`/superadmin/fix/entries/${competitionId}/${teamId}/players/${playerId}`, data),
    removeEntryPlayer: (competitionId, teamId, playerId, reason) => api.post(`/superadmin/fix/entries/${competitionId}/${teamId}/players/${playerId}/remove`, { reason }),
    setEntryStatus: (competitionId, teamId, data) => api.post(`/superadmin/fix/entries/${competitionId}/${teamId}/status`, data),
    recordMoney: (competitionId, teamId, data) => api.post(`/superadmin/fix/entries/${competitionId}/${teamId}/money`, data),
  },
  createPlayerPaymentOrder: (data) => api.post('/superadmin/players/payment/create', data),
  verifyPlayerPaymentAndAdd: (data) => {
    return api.post('/superadmin/players/payment/verify', data);
  },
};
