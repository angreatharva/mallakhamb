import { useQuery } from '@tanstack/react-query';
import { adminAPI, coachAPI, playerAPI, superAdminAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

const profileFetchers = {
  player: async () => {
    try {
      const response = await playerAPI.getTeam();
      return {
        data: {
          player: response.data?.player,
          team: response.data?.team,
          teamStatus: response.data?.teamStatus,
        },
      };
    } catch {
      return playerAPI.getProfile();
    }
  },
  coach: () => coachAPI.getProfile(),
  admin: () => adminAPI.getProfile(),
  superadmin: () => superAdminAPI.getProfile(),
};

export function useProfileQuery({ scope = 'player', enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.profile(scope),
    enabled,
    queryFn: async () => {
      const fetcher = profileFetchers[scope];
      if (!fetcher) {
        throw new Error(`Unsupported profile query scope: ${scope}`);
      }
      const response = await fetcher();
      const keyMap = {
        player: 'player',
        coach: 'coach',
        admin: 'admin',
        superadmin: 'admin',
      };
      const base =
        response.data?.[keyMap[scope]] || response.data?.user || response.data?.profile || null;
      if (scope === 'player' && base) {
        return {
          ...base,
          team: response.data?.team || base.team,
          teamStatus: response.data?.teamStatus || base.teamStatus || 'Not assigned',
        };
      }
      return base;
    },
  });
}
