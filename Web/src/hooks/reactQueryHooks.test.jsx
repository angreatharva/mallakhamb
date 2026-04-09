import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTeamsQuery } from './queries/useTeamsQuery';
import { useScoresQuery } from './queries/useScoresQuery';
import { useCreateTeamMutation } from './mutations/useCreateTeamMutation';
import { useUpdateScoreMutation } from './mutations/useUpdateScoreMutation';

const mocks = vi.hoisted(() => ({
  publicAPI: {
    getTeams: vi.fn(),
    getScores: vi.fn(),
  },
  coachAPI: {
    getTeams: vi.fn(),
    createTeam: vi.fn(),
  },
  playerAPI: {
    getTeams: vi.fn(),
  },
  adminAPI: {
    getAllTeams: vi.fn(),
    getAllPlayers: vi.fn(),
    saveScores: vi.fn(),
  },
  judgeAPI: {
    saveScore: vi.fn(),
  },
}));

vi.mock('../services/api', () => mocks);

function createWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('react query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches teams using useTeamsQuery', async () => {
    mocks.publicAPI.getTeams.mockResolvedValue({
      data: { teams: [{ _id: 't1', name: 'A Team' }] },
    });
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useTeamsQuery({ scope: 'public' }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ _id: 't1', name: 'A Team' }]);
    expect(mocks.publicAPI.getTeams).toHaveBeenCalledTimes(1);
  });

  it('fetches scores and exposes loading/error state', async () => {
    mocks.publicAPI.getScores.mockRejectedValueOnce(new Error('network'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const params = { teamId: 't1', gender: 'Male', ageGroup: 'Under12' };
    const { result } = renderHook(() => useScoresQuery({ params, enabled: true }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading || result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.publicAPI.getScores).toHaveBeenCalledWith(params);
  });

  it('applies optimistic update in useCreateTeamMutation', async () => {
    const deferred = createDeferred();
    mocks.coachAPI.createTeam.mockImplementation(() => deferred.promise);
    const queryClient = new QueryClient();
    queryClient.setQueryData(['teams', 'coach', {}], [{ _id: 'old', name: 'Old Team' }]);

    const { result } = renderHook(() => useCreateTeamMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ name: 'New Team', description: 'Desc' });
    });

    await waitFor(() => {
      const data = queryClient.getQueryData(['teams', 'coach', {}]);
      expect(data).toHaveLength(2);
    });

    act(() => {
      deferred.resolve({ data: { team: { _id: 'real', name: 'New Team' } } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('submits score mutation and invalidates scores', async () => {
    mocks.judgeAPI.saveScore.mockResolvedValue({ data: { ok: true } });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateScoreMutation({ scope: 'judge' }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ playerId: 'p1', score: 8.7 });
    });

    expect(mocks.judgeAPI.saveScore).toHaveBeenCalledWith({ playerId: 'p1', score: 8.7 });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
