import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiConfig from '../utils/apiConfig.js';
import { getTokenData } from '../utils/tokenUtils.js';
import { secureStorage } from '../utils/secureStorage.js';
import { logger } from '../utils/logger.js';

const CompetitionContext = createContext();

export const useCompetition = () => {
  const context = useContext(CompetitionContext);
  if (!context) {
    throw new Error('useCompetition must be used within a CompetitionProvider');
  }
  return context;
};

export const CompetitionProvider = ({ children, userType }) => {
  const [currentCompetition, setCurrentCompetition] = useState(null);
  const [assignedCompetitions, setAssignedCompetitions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper to get token for current user type
  const getToken = useCallback(() => {
    if (!userType) return null;
    return secureStorage.getItem(`${userType}_token`);
  }, [userType]);

  // Helper to extract competition from token
  const getCompetitionFromToken = useCallback(() => {
    const token = getToken();
    if (!token) return null;

    const decoded = getTokenData(token);
    return decoded?.currentCompetition || null;
  }, [getToken]);

  // Fetch assigned competitions for the user (callable for manual refresh)
  const fetchAssignedCompetitions = useCallback(async () => {
    const token = getToken();
    if (!userType || !token || userType === 'judge') return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get(`${apiConfig.getBaseUrl()}/auth/competitions/assigned`, {
        headers: { Authorization: `Bearer ${token}`, ...apiConfig.getHeaders() },
      });
      const competitions = response.data.competitions || [];
      setAssignedCompetitions(competitions);
      const competitionId = getCompetitionFromToken();
      if (competitionId) {
        const match = competitions.find((c) => c._id === competitionId);
        if (match) setCurrentCompetition(match);
      }
    } catch (err) {
      logger.error('Failed to fetch assigned competitions:', err);
      setError(err.response?.data?.message || 'Failed to load competitions');
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, getCompetitionFromToken]);

  // Switch to a different competition
  const switchCompetition = useCallback(
    async (competitionId) => {
      if (!userType) {
        throw new Error('User type is required to switch competition');
      }

      const token = getToken();
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Prevent multiple simultaneous switches
      if (isLoading) {
        throw new Error('Competition switch already in progress');
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.post(
          `${apiConfig.getBaseUrl()}/auth/set-competition`,
          { competitionId },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ...apiConfig.getHeaders(),
            },
          }
        );

        // Update token in secure storage
        const newToken = response.data.token;
        secureStorage.setItem(`${userType}_token`, newToken);

        // Update current competition
        const competition = assignedCompetitions.find((c) => c._id === competitionId);
        if (competition) {
          setCurrentCompetition(competition);
        }

        // Small delay for state update before reload
        await new Promise((resolve) => setTimeout(resolve, 100));
        window.location.reload();
      } catch (err) {
        logger.error('Failed to switch competition:', err);
        setError(err.response?.data?.message || 'Failed to switch competition');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [userType, getToken, assignedCompetitions, isLoading]
  );

  // Clear competition context (for logout)
  const clearCompetitionContext = useCallback(() => {
    setCurrentCompetition(null);
    setAssignedCompetitions([]);
    setError(null);
  }, []);

  // Load competitions on mount and when userType changes
  useEffect(() => {
    let isMounted = true;

    const loadCompetitions = async () => {
      if (!userType || !getToken() || userType === 'judge') {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get(`${apiConfig.getBaseUrl()}/auth/competitions/assigned`, {
          headers: { Authorization: `Bearer ${getToken()}`, ...apiConfig.getHeaders() },
        });

        if (!isMounted) return;

        const competitions = response.data.competitions || [];
        setAssignedCompetitions(competitions);

        const competitionId = getCompetitionFromToken();
        if (competitionId) {
          const match = competitions.find((c) => c._id === competitionId);
          if (match) setCurrentCompetition(match);
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Failed to fetch assigned competitions:', err);
          setError(err.response?.data?.message || 'Failed to load competitions');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadCompetitions();
    return () => {
      isMounted = false;
    };
  }, [userType, getToken, getCompetitionFromToken]);

  const value = {
    currentCompetition,
    assignedCompetitions,
    isLoading,
    error,
    switchCompetition,
    fetchAssignedCompetitions,
    clearCompetitionContext,
  };

  return <CompetitionContext.Provider value={value}>{children}</CompetitionContext.Provider>;
};

// Convenience hook for accessing competition error
export const useCompetitionError = () => {
  const { error } = useCompetition();
  return error;
};

export default CompetitionContext;
