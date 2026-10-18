import api from '../api-client.js';

/**
 * Admin API surface, parameterised by base path so `/admin`, `/superadmin` and
 * `/judge` can share it.
 *
 * `getProfile` (`GET ${basePath}/profile`) and `addScore`
 * (`POST ${basePath}/scores`) were removed: neither path is declared by any
 * router — not admin, not superadmin — and neither had a caller. They only
 * advertised a 404.
 *
 * Note that not every method here is valid for every base path. `register` and
 * `getAllPlayers` exist under `/admin` but NOT under `/superadmin`, which is why
 * super-admin.api.js drops them explicitly rather than inheriting them.
 */
export const createAdminAPI = (basePath = '/admin') => ({
  register: (data) => api.post(`${basePath}/register`, data),
  login: (data) => api.post(`${basePath}/login`, data),
  getDashboard: () => api.get(`${basePath}/dashboard`),
  getAllTeams: (params) => api.get(`${basePath}/teams`, { params }),
  getTeamDetails: (teamId, params) => api.get(`${basePath}/teams/${teamId}`, { params }),
  getAllPlayers: (params) => api.get(`${basePath}/players`, { params }),
  getTeamScores: (params) => api.get(`${basePath}/scores/team`, { params }),
  getIndividualScores: (params) => api.get(`${basePath}/scores/individual`, { params }),
  getTeamRankings: (params) => api.get(`${basePath}/scores/team-rankings`, { params }),
  /**
   * Record the physical lucky draw for one tied group (COP 1.12.4), first place first.
   * @param {{gender, ageGroup, competitionType, apparatus, order: string[], competition?: string}} data
   */
  recordTieBreakDraw: (data) => api.post(`${basePath}/tie-break/draws`, data),
  /** @param {{gender, ageGroup, competitionType, apparatus, groupKey: string, competition?: string}} data */
  clearTieBreakDraw: (data) => api.delete(`${basePath}/tie-break/draws`, { data }),
  getSubmittedTeams: (params) => api.get(`${basePath}/teams/submitted`, { params }),
  saveJudges: (data) => api.post(`${basePath}/judges/bulk`, data),
  getJudges: (params) => api.get(`${basePath}/judges`, { params }),
  getAllJudgesSummary: (params) => api.get(`${basePath}/judges/summary`, { params }),
  updateJudge: (judgeId, data) => api.put(`${basePath}/judges/${judgeId}`, data),
  createSingleJudge: (data) => api.post(`${basePath}/judges`, data),
  deleteJudge: (judgeId) => api.delete(`${basePath}/judges/${judgeId}`),
  /**
   * Registered judges who can be seated on a panel.
   *
   * Judges register themselves, so this search is the only way a slot gets
   * filled — an empty result means that person has not signed up yet.
   */
  searchJudgeAccounts: (q) => api.get(`${basePath}/judge-accounts`, { params: { q } }),
  startAgeGroup: (data) => api.post(`${basePath}/age-groups/start`, data),
  saveScores: (data) => api.post(`${basePath}/scores/save`, data),
  unlockScores: (scoreId) => api.put(`${basePath}/scores/${scoreId}/unlock`),
  getTransactions: (params) => api.get(`${basePath}/transactions`, { params }),
});

export const adminAPI = createAdminAPI('/admin');
