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
   * `competitionId` goes in the QUERY STRING, not a header: `/players/teams`
   * carries no `validateCompetitionContext`, so `req.competitionId` is never
   * populated for it and the controller falls through to
   * `req.query.competitionId`.
   *
   * BE AWARE that the server does not act on it yet. The controller reads it
   * and passes it down, but `PlayerService.getAvailableTeams()` takes no
   * arguments and returns every active team — so the list is NOT scoped to the
   * meet, whatever is sent here. It is sent anyway because this is the correct
   * call site for when that is fixed, and because the alternative is a screen
   * that silently drops the only context it has.
   */
  getTeams: (competitionId) =>
    api.get('/players/teams', competitionId ? { params: { competitionId } } : undefined),
  getOpenCompetitions: () => api.get('/players/competitions/open'),
};
