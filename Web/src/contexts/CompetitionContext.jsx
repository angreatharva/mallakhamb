import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiConfig from '../utils/apiConfig.js';
import { getTokenData } from '../utils/tokenUtils.js';
import { secureStorage } from '../utils/secureStorage.js';

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

  // Fetch assigned competitions for the user
  const fetchAssignedCompetitions = useCallback(async () => {
    if (!userType) {
      setIsLoading(false);
      return;
    }

    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get(
        `${apiConfig.getBaseUrl()}/auth/competitions/assigned`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...apiConfig.getHeaders(),
          },
        }
      );

      setAssignedCompetitions(response.data.competitions || []);

      // Check if there's a competition in the token
      const competitionId = getCompetitionFromToken();
      if (competitionId) {
        const competition = response.data.competitions.find(
          (c) => c._id === competitionId
        );
        if (competition) {
          setCurrentCompetition(competition);
        }
      }
    } catch (err) {
      console.error('Failed to fetch assigned competitions:', err);
      setError(err.response?.data?.message || 'Failed to load competitions');
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, getCompetitionFromToken]);

  // Switch to a different competition
  const switchCompetition = useCallback(async (competitionId) => {
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
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch competition:', err);
      setError(err.response?.data?.message || 'Failed to switch competition');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, assignedCompetitions, isLoading]);

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
      if (!userType) {
        setIsLoading(false);
        return;
      }

      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get(
          `${apiConfig.getBaseUrl()}/auth/competitions/assigned`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ...apiConfig.getHeaders(),
            },
          }
        );

        if (isMounted) {
          setAssignedCompetitions(response.data.competitions || []);

          const competitionId = getCompetitionFromToken();
          if (competitionId) {
            const competition = response.data.competitions.find(
              (c) => c._id === competitionId
            );
            if (competition) {
              setCurrentCompetition(competition);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch assigned competitions:', err);
          setError(err.response?.data?.message || 'Failed to load competitions');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
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

  return (
    <CompetitionContext.Provider value={value}>
      {children}
    </CompetitionContext.Provider>
  );
};

export default CompetitionContext;
