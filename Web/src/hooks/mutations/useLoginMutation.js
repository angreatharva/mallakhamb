import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { adminAPI, coachAPI, playerAPI, superAdminAPI } from '../../services/api';
import apiConfig from '../../utils/apiConfig';

const roleApiMap = {
  admin: adminAPI,
  superadmin: superAdminAPI,
  coach: coachAPI,
  player: playerAPI,
};

export function useLoginMutation({ role }) {
  return useMutation({
    mutationFn: async (credentials) => {
      if (role === 'judge') {
        const response = await axios.post(`${apiConfig.getBaseUrl()}/judge/login`, credentials, {
          headers: apiConfig.getHeaders(),
        });
        return response.data;
      }

      const service = roleApiMap[role];
      if (!service) {
        throw new Error(`Unsupported login role: ${role}`);
      }
      const response = await service.login(credentials);
      return response.data;
    },
  });
}
