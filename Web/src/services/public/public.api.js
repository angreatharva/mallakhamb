import { publicApi } from '../api-client.js';

export const publicAPI = {
  /** Who qualified for each Competition II / III final of a meet. */
  getFinals: (competitionId) => publicApi.get('/public/finals', { params: { competitionId } }),
  getCompetitions: () => publicApi.get('/public/competitions'),
  getTeams: (params) => publicApi.get('/public/teams', { params }),
  getScores: (params) => publicApi.get('/public/scores', { params }),
  // { competitionId, gender, ageGroup } — Competition I standing, ranked on the server.
  getTeamChampionship: (params) => publicApi.get('/public/team-championship', { params }),
};
