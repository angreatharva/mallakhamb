import { publicApi } from '../api-client.js';

export const judgeAPI = {
  getCompetitions: () => publicApi.get('/public/competitions'),
  getJudges: (params) => publicApi.get('/public/judges', { params }),
  getSubmittedTeams: (params) => publicApi.get('/public/submitted-teams', { params }),
  saveScore: (data) => publicApi.post('/public/save-score', data),
};
