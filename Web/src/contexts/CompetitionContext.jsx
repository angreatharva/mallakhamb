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
  // Debug logging
  useEffect(() => {
    logger.info('CompetitionProvider initialized', { userType });
  }, [userType]);

  // Synchronously restore the last-selected competition from storage so the
  // navbar never flashes "Select" while the async fetch is in flight.
  const getStoredCompetition = (type) => {
    if (!type) return null;
    try {
      const stored = secureStorage.getItem(`${type}_current_competition`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const [currentCompetition, setCurrentCompetition] = useState(() => getStoredCompetition(userType));
  const [assignedCompetitions, setAssignedCompetitions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Persist currentCompetition to storage whenever it changes so it survives navigation
  useEffect(() => {
    if (!userType) return;
    logger.info('CompetitionProvider: currentCompetition changed', { 
      userType, 
      hasCompetition: !!currentCompetition,
      competitionId: currentCompetition?._id,
      competitionName: currentCompetition?.name
    });
    if (currentCompetition && currentCompetition.name) {
      secureStorage.setItem(`${userType}_current_competition`, JSON.stringify(currentCompetition));
    } else if (!currentCompetition) {
      secureStorage.removeItem(`${userType}_current_competition`);
    }
  }, [currentCompetition, userType]);

  // Helper to get token for current user type
  const getToken = useCallback(() => {
    if (!userType) return null;
    return secureStorage.getItem(`${userType}_token`);
  }, [userType]);

  // Helper to extract competition ID from token (synchronous)
  const getCompetitionFromToken = useCallback(() => {
    const token = getToken();
    if (!token) return null;
    const decoded = getTokenData(token);
    return decoded?.competitionId || null;
  }, [getToken]);

  // Fetch assigned competitions for the user (callable for manual refresh)
  const fetchAssignedCompetitions = useCallback(async () => {
    const token = getToken();
    if (!userType || !token || userType === 'judge') return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get(
        `${apiConfig.getBaseUrl()}/auth/competitions/assigned`,
        { headers: { Authorization: `Bearer ${token}`, ...apiConfig.getHeaders() } }
      );
      const responseData = response.data.data || response.data;
      const competitions = responseData.competitions || [];
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
  const switchCompetition = useCallback(async (competitionId) => {
    if (!userType) throw new Error('User type is required to switch competition');

    const token = getToken();
    if (!token) throw new Error('Authentication token not found');

    if (isLoading) throw new Error('Competition switch already in progress');

    try {
      setIsLoading(true);
      setError(null);

      // Find the competition in the assigned list first
      const competition = assignedCompetitions.find((c) => c._id === competitionId);
      if (!competition) {
        throw new Error('Competition not found in assigned competitions');
      }

      // Update state IMMEDIATELY (optimistic update)
      setCurrentCompetition(competition);
      secureStorage.setItem(`${userType}_current_competition`, JSON.stringify(competition));
      logger.info('Competition set optimistically', { competitionId, competitionName: competition.name });

      // Then make the API call to update the token
      const response = await axios.post(
        `${apiConfig.getBaseUrl()}/auth/set-competition`,
        { competitionId },
        { headers: { Authorization: `Bearer ${token}`, ...apiConfig.getHeaders() } }
      );

      // Persist new token (now contains competitionId in payload)
      const newToken = response.data.data?.token || response.data.token;
      secureStorage.setItem(`${userType}_token`, newToken);

      logger.info('Competition switched successfully', { competitionId, competitionName: competition.name });
    } catch (err) {
      logger.error('Failed to switch competition:', err);
      // Revert optimistic update on error
      const storedCompetition = getStoredCompetition(userType);
      setCurrentCompetition(storedCompetition);
      setError(err.response?.data?.message || 'Failed to switch competition');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, assignedCompetitions, isLoading, getStoredCompetition]);

  // Clear competition context (for logout)
  const clearCompetitionContext = useCallback(() => {
    setCurrentCompetition(null);
    setAssignedCompetitions([]);
    setError(null);
    if (userType) secureStorage.removeItem(`${userType}_current_competition`);
  }, [userType]);

  // Load competitions on mount and when userType changes.
  // Also restores currentCompetition from the token synchronously so the
  // navbar shows the right value immediately without waiting for the fetch.
  useEffect(() => {
    let isMounted = true;

    const loadCompetitions = async () => {
      if (!userType || !getToken() || userType === 'judge') {
        setIsLoading(false);
        return;
      }

      // ── Synchronous restore ──────────────────────────────────────────────
      // Read competitionId from the token right away so the navbar doesn't
      // flash "Select" while the network request is in flight.
      const pendingCompetitionId = getCompetitionFromToken();

      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get(
          `${apiConfig.getBaseUrl()}/auth/competitions/assigned`,
          { headers: { Authorization: `Bearer ${getToken()}`, ...apiConfig.getHeaders() } }
        );

        if (!isMounted) return;

        const responseData = response.data.data || response.data;
        const competitions = responseData.competitions || [];
        setAssignedCompetitions(competitions);

        // Restore the full competition object using the ID from the token.
        // Only update if we found a match — don't wipe an already-set value.
        if (pendingCompetitionId) {
          const match = competitions.find((c) => c._id === pendingCompetitionId);
          if (match) {
            setCurrentCompetition(match);
          }
        } else {
          // No competition in token — clear it
          setCurrentCompetition(null);
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
    return () => { isMounted = false; };
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

/**
 * Convenience hook — returns the competition error string (if any) so pages
 * can surface it without manually destructuring the full context.
 * Returns null when there is no error.
 */
export const useCompetitionError = () => {
  const { error } = useCompetition();
  return error;
};
