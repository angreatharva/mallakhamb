/**
 * Judge API surface.
 *
 * HIGH-W3: this module previously sat on `publicApi`, which has **no request
 * interceptor** — so it would have sent no `Authorization` header and 401'd
 * against the routes the server authenticated in its Phase 1. Nothing imported
 * it, so the judge pages each hand-rolled their own axios call with a manual
 * Bearer header instead, and in doing so lost everything the interceptors on
 * `api` provide:
 *
 *   - the request interceptor that attaches `Authorization` and
 *     `x-competition-id`, derived from the role in the URL — which resolves to
 *     `judge` on every /judge/* route, i.e. exactly the token these pages were
 *     reading by hand
 *   - the response interceptor that performs a single-flight silent refresh on
 *     401 and dispatches AUTH_EXPIRED when that fails
 *
 * Without the second one, a judge's access token expiring between two
 * performers produced a raw 401 that each call site swallowed into a
 * `logger.warn`, so Panel Review rendered an empty panel as though no judge had
 * submitted yet. No refresh was attempted, no redirect happened, and nothing
 * surfaced the real cause.
 *
 * Rebuilt on `api`. Every judge-facing call belongs here.
 */

import { api } from '../api-client.js';

export const judgeAPI = {
  /**
   * Judge sign-in. Goes through `api` — NOT raw axios — because CRIT-3 is
   * enforced: login is a POST with no Bearer token yet (you do not have one),
   * so it is exactly the cookie-only case CSRF rejects. Raw axios sends no
   * X-CSRF-Token and the server answers 403 "CSRF token missing", which breaks
   * judge login outright. The other roles were already on `api` and unaffected.
   */
  login: (email, password) => api.post('/judge/login', { email, password }),

  /**
   * Judge self-registration. A new account sits on no panel, so it grants no
   * access to any competition until an organiser assigns it.
   */
  register: (data) => api.post('/judge/register', data),

  /** The judge's own account, with every panel they sit on. */
  getProfile: () => api.get('/judge/profile'),

  /** Update the judge's own account. Panel assignments are not editable here. */
  updateProfile: (data) => api.put('/judge/profile', data),

  /** Change the judge's own password; requires the current one. */
  changePassword: (currentPassword, newPassword) =>
    api.put('/judge/profile/password', { currentPassword, newPassword }),

  /** Every panel this judge sits on, across competitions. */
  getAssignments: () => api.get('/judge/assignments'),

  /** Anonymous on the server, but routed through `api` so one instance serves this module. */
  getCompetitions: () => api.get('/public/competitions'),

  /** Panel roster for a category. Authenticated since server Phase 1.4. */
  getJudges: (params) => api.get('/public/judges', { params }),

  /** Teams registered and submitted for a competition. Authenticated since server Phase 1.4. */
  getSubmittedTeams: (params) => api.get('/public/submitted-teams', { params }),

  /** Submit or update a judge slip. Authenticated since server Phase 1.1. */
  saveScore: (data) => api.post('/public/save-score', data),

  /**
   * Slips already submitted for a category.
   *
   * Deliberately the judge-authenticated /judge/scores/team, NOT /public/scores:
   * the public endpoint is built for the results page, so it returns only locked
   * documents and drops every player that is not finalized — a panel still being
   * scored comes back empty, which is exactly the state the judge pages exist to
   * show.
   */
  getTeamScores: (params) => api.get('/judge/scores/team', { params }),

  /** Players on a team, with per-player scored/finalized flags. */
  getTeamPlayers: (teamId) => api.get(`/judge/teams/${teamId}/players`),

  /**
   * COP Nov 2022 scoring constants. Anonymous and heavily cached server-side.
   * Used to detect drift against the bundled tables (MED-W5).
   */
  getCopRules: () => api.get('/public/cop-rules'),
};

export default judgeAPI;
