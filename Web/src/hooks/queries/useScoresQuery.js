import { useQuery } from '@tanstack/react-query';
import { publicAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

export function useScoresQuery({ params = {}, enabled = true, scope = 'public' } = {}) {
  return useQuery({
    queryKey: queryKeys.scores(scope, params),
    enabled,
    queryFn: async () => {
      const response = await publicAPI.getScores(params);
      return response.data?.scores || [];
    },
  });
}
