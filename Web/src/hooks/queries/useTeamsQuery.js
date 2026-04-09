import { useQuery } from '@tanstack/react-query';
import { adminAPI, coachAPI, playerAPI, publicAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

const teamFetchers = {
  public: () => publicAPI.getTeams(),
  coach: () => coachAPI.getTeams(),
  player: () => playerAPI.getTeams(),
  admin: (params) => adminAPI.getAllTeams(params),
};

export function useTeamsQuery({ scope = 'public', params = {}, enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.teams(scope, params),
    enabled,
    queryFn: async () => {
      const fetcher = teamFetchers[scope];
      if (!fetcher) {
        throw new Error(`Unsupported team query scope: ${scope}`);
      }
      const response = await fetcher(params);
      return response.data?.teams || [];
    },
  });
}
