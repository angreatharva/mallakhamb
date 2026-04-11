import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI, judgeAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

const mutationByScope = {
  judge: (payload) => judgeAPI.saveScore(payload),
  admin: (payload) => adminAPI.saveScores(payload),
};

export function useUpdateScoreMutation({ scope = 'judge', invalidateParams = {} } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const executor = mutationByScope[scope];
      if (!executor) {
        throw new Error(`Unsupported score mutation scope: ${scope}`);
      }
      return executor(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scores('public', invalidateParams) });
      queryClient.invalidateQueries({ queryKey: ['scores'] });
    },
  });
}
