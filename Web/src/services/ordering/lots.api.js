/**
 * Running-order (lot draw + drag sequence) API surface.
 *
 * The server mounts the same four handlers under `/admin`, `/superadmin` and
 * `/judge`, differing only in the guard in front of them, so one factory
 * parameterised by base path covers all three callers.
 *
 * Built on the `api` instance — never raw axios and never `publicApi`. `api`
 * is what attaches `Authorization` and `x-competition-id` (derived from the
 * role in the URL, so `/judge/*` reads `judge_token` and `/admin/*` reads
 * `admin_token`), performs the single-flight silent refresh on 401, and sends
 * the CSRF header these POST/PUT calls are rejected without.
 */

import api from '../api-client.js';

/**
 * @param {string} basePath - '/admin' | '/superadmin' | '/judge'
 */
export const createLotsAPI = (basePath) => ({
  /**
   * Teams and athletes for a category, already sorted into running order.
   * @param {{gender: string, ageGroup: string, competitionType: string, competitionId?: string}} params
   */
  getOrder: (params) => api.get(`${basePath}/lots`, { params }),

  /**
   * Draw lots. Admin / SuperAdmin only — the judge base path has no such route
   * and will 404, which is deliberate.
   * @param {{gender, ageGroup, competitionType, competitionId?, includePlayers?}} data
   */
  drawLots: (data) => api.post(`${basePath}/lots/draw`, data),

  /** @param {{gender, ageGroup, competitionType, competitionId?, teamIds: string[]}} data */
  setTeamOrder: (data) => api.put(`${basePath}/lots/teams`, data),

  /** @param {{gender, ageGroup, competitionType, competitionId?, teamId: string, playerIds: string[]}} data */
  setPlayerOrder: (data) => api.put(`${basePath}/lots/players`, data),
});

export const adminLotsAPI = createLotsAPI('/admin');
export const superAdminLotsAPI = createLotsAPI('/superadmin');
export const judgeLotsAPI = createLotsAPI('/judge');

export default createLotsAPI;
