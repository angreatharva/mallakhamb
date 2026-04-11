import { useQuery } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

export function usePlayersQuery({ params = {}, enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.players('admin', params),
    enabled,
    queryFn: async () => {
      const response = await adminAPI.getAllPlayers(params);
      return response.data?.players || [];
    },
  });
}
