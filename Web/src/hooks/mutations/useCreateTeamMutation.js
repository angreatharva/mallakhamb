import { useMutation, useQueryClient } from '@tanstack/react-query';
import { coachAPI } from '../../services/api';
import { queryKeys } from '../../utils/queryClient';

export function useCreateTeamMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => coachAPI.createTeam(payload),
    onMutate: async (newTeamPayload) => {
      const key = queryKeys.teams('coach');
      await queryClient.cancelQueries({ queryKey: key });
      const previousTeams = queryClient.getQueryData(key);
      const optimisticTeam = {
        _id: `temp-${Date.now()}`,
        name: newTeamPayload.name,
        description: newTeamPayload.description || '',
      };
      queryClient.setQueryData(key, (old = []) => [...old, optimisticTeam]);
      return { previousTeams, key };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTeams) {
        queryClient.setQueryData(context.key, context.previousTeams);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams('coach') });
    },
  });
}
