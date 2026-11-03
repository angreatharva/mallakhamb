import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';

/** Sign the judge out the one way every judge screen with a Logout button does it. */
export const useJudgeLogout = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  return useCallback(async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  }, [clearCompetitionContext, logout, navigate]);
};
