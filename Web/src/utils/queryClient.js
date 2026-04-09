import { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  teams: (scope = 'default', params = {}) => ['teams', scope, params],
  players: (scope = 'default', params = {}) => ['players', scope, params],
  scores: (scope = 'default', params = {}) => ['scores', scope, params],
  profile: (scope = 'default') => ['profile', scope],
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
