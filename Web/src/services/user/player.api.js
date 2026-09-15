import api from '../api-client.js';

export const playerAPI = {
  register: (data) => api.post('/players/register', data),
  login: (data) => api.post('/players/login', data),
  getProfile: () => api.get('/players/profile'),
  getTeam: () => api.get('/players/team'),
  updateTeam: (data) => api.post('/players/team/join', data),
  /**
   * Teams a player can join.
   *
   * `competitionId` is a QUERY parameter rather than something the request
   * interceptor supplies: `/players/teams` carries no `validateCompetitionContext`,
   * so `req.competitionId` is never populated for it and the handler falls
   * through to `req.query.competitionId`. Sending the header alone would be
   * silently ignored and the player would be offered teams from every open
   * competition at once.
   */
  getTeams: (competitionId) =>
    api.get('/players/teams', competitionId ? { params: { competitionId } } : undefined),
  getOpenCompetitions: () => api.get('/players/competitions/open'),
};
