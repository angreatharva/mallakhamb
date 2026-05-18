import api from '../api-client.js';

export const playerAPI = {
  register: (data) => api.post('/players/register', data),
  login: (data) => api.post('/players/login', data),
  getProfile: () => api.get('/players/profile'),
  getTeam: () => api.get('/players/team'),
  updateTeam: (data) => api.post('/players/team/join', data),
  getTeams: () => api.get('/players/teams'),
  getOpenCompetitions: () => api.get('/players/competitions/open'),
};
