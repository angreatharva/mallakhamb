import { publicApi } from '../api-client.js';

export const publicAPI = {
  getCompetitions: () => publicApi.get('/public/competitions'),
  getTeams: (params) => publicApi.get('/public/teams', { params }),
  getScores: (params) => publicApi.get('/public/scores', { params }),
};
