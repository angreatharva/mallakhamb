import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getTokenData } from '@/utils/auth/tokenUtils.js';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { logger } from '@/infrastructure/logger.js';
import { authAPI } from '@/services/auth/auth.api.js';
import { normalizeLevel, competitionsAtLevel } from '@/utils/competition/levels.js';

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

  /*
   * Where the user is RIGHT NOW, read through a ref.
   *
   * Only the auto-select below uses it, and it has to be the value at the
   * moment that decision is taken rather than at the moment the effect was
   * scheduled — the two are seconds apart, and what happens in between is the
   * user walking onto the chooser. A ref, not a dependency: adding location to
   * the effect's deps would re-fetch the assigned list on every navigation.
   */
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

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

  /**
   * The level chosen at `/{role}/select-level`, restored synchronously so a
   * reload on `/{role}/select-competition` does not bounce back to the chooser.
   *
   * Normalized on the way in: a stale value left in storage from before a
   * rename would otherwise filter the list down to nothing, which reads as
   * "you have no competitions" rather than "that level no longer exists".
   */
  const getStoredLevel = (type) => {
    if (!type) return null;
    return normalizeLevel(secureStorage.getItem(`${type}_selected_level`));
  };

  const [currentCompetition, setCurrentCompetition] = useState(() => getStoredCompetition(userType));
  const [assignedCompetitions, setAssignedCompetitions] = useState([]);
  const [selectedLevel, setSelectedLevelState] = useState(() => getStoredLevel(userType));
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

  /**
   * Record the chosen level. Persisted per role, like the competition itself,
   * because the chooser and the competition list are separate routes and a
   * reload between them must not lose the choice.
   *
   * An unrecognised value clears the selection rather than storing garbage.
   */
  const setSelectedLevel = useCallback(
    (level) => {
      const next = normalizeLevel(level);
      setSelectedLevelState(next);
      if (!userType) return;
      if (next) {
        secureStorage.setItem(`${userType}_selected_level`, next);
      } else {
        secureStorage.removeItem(`${userType}_selected_level`);
      }
    },
    [userType]
  );

  /** Drop the level so the next visit starts at the chooser. */
  const clearSelectedLevel = useCallback(() => setSelectedLevel(null), [setSelectedLevel]);

  /**
   * The assigned list narrowed to the chosen level.
   *
   * Filtered here, on documents the server already returns with `level` on
   * them, rather than by querying per level. The coach/player list comes from
   * `getOpenCompetitions`, which is cached server-side under the single flat key
   * `competitions:open` with no level in it — pushing the filter down there
   * would serve one level's list to somebody who asked for another.
   */
  const competitionsForSelectedLevel = useMemo(
    () => competitionsAtLevel(assignedCompetitions, selectedLevel),
    [assignedCompetitions, selectedLevel]
  );

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

  /** Re-read on each render so effects re-run when JWT competitionId changes (e.g. after registration). */
  const competitionIdInToken = getCompetitionFromToken();

  /**
   * Merge assigned list + current selection from token.
   * If the API list is briefly missing the JWT competition (e.g. right after register), use stored full object.
   */
  const finalizeAssignmentsFromApi = useCallback(
    (apiCompetitions) => {
      const competitionId = getCompetitionFromToken();
      let list = Array.isArray(apiCompetitions) ? [...apiCompetitions] : [];

      if (competitionId && !list.some((c) => c._id === competitionId)) {
        const stored = getStoredCompetition(userType);
        if (stored?._id === competitionId) {
          list.push(stored);
          logger.info('finalizeAssignmentsFromApi: Merged stored competition into assigned list', {
            competitionId,
          });
        }
      }

      setAssignedCompetitions(list);

      if (competitionId) {
        const match = list.find((c) => c._id === competitionId);
        if (match) {
          setCurrentCompetition(match);
        } else {
          logger.warn('Competition from token not found in assigned list after merge', {
            competitionId,
            availableIds: list.map((c) => c._id),
          });
          setCurrentCompetition(null);
        }
      }
    },
    [userType, getCompetitionFromToken]
  );

  /** Immediately add a competition to the dropdown and select it (e.g. after register + set-competition). */
  const mergeAssignedAndSelectCompetition = useCallback(
    (competition) => {
      const id = competition?._id || competition?.id;
      if (!userType || !id) return;
      const normalized = { ...competition, _id: id };
      setAssignedCompetitions((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        if (base.some((c) => c._id === id || c.id === id)) return base;
        return [...base, normalized];
      });
      setCurrentCompetition(normalized);
      secureStorage.setItem(`${userType}_current_competition`, JSON.stringify(normalized));
    },
    [userType]
  );

  // Fetch assigned competitions for the user (callable for manual refresh)
  const fetchAssignedCompetitions = useCallback(async () => {
    const token = getToken();
    if (!userType || !token || userType === 'judge') {
      logger.warn('fetchAssignedCompetitions: Skipping fetch', { userType, hasToken: !!token });
      return;
    }

    logger.info('fetchAssignedCompetitions: Starting fetch', { userType });

    try {
      setIsLoading(true);
      setError(null);
      // HIGH-W3: through the API client, so a 401 gets a silent refresh and an
      // AUTH_EXPIRED dispatch instead of surfacing as "no competitions".
      const response = await authAPI.getAssignedCompetitions();
      const responseData = response.data.data || response.data;
      const competitions = responseData.competitions || [];
      
      logger.info('fetchAssignedCompetitions: Competitions fetched', {
        count: competitions.length,
        competitionIds: competitions.map(c => c._id),
        competitionNames: competitions.map(c => c.name)
      });
      
      finalizeAssignmentsFromApi(competitions);
    } catch (err) {
      logger.error('Failed to fetch assigned competitions:', err);
      setError(err.response?.data?.message || 'Failed to load competitions');
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, getCompetitionFromToken, finalizeAssignmentsFromApi]);

  // Switch to a different competition
  const switchCompetition = useCallback(async (competitionId) => {
    if (!userType) throw new Error('User type is required to switch competition');

    const token = getToken();
    if (!token) throw new Error('Authentication token not found');

    if (isLoading) throw new Error('Competition switch already in progress');

    try {
      setIsLoading(true);
      setError(null);

      let competition = assignedCompetitions.find((c) => c._id === competitionId);
      if (!competition && currentCompetition?._id === competitionId) {
        competition = currentCompetition;
      }
      if (!competition && userType) {
        const stored = getStoredCompetition(userType);
        if (stored?._id === competitionId) competition = stored;
      }
      if (!competition) {
        throw new Error('Competition not found in assigned competitions');
      }

      logger.info('switchCompetition: Starting switch', { 
        competitionId, 
        competitionName: competition.name,
        currentCompetitionId: currentCompetition?._id,
        currentCompetitionName: currentCompetition?.name
      });

      // Make the API call to update the token FIRST (before optimistic update)
      const response = await authAPI.setCompetition(competitionId);

      // Persist new token (now contains competitionId in payload)
      const newToken = response.data.data?.token || response.data.token;
      secureStorage.setItem(`${userType}_token`, newToken);
      logger.info('Competition switched successfully - token updated', { competitionId, competitionName: competition.name });

      // NOW update state (this will trigger useEffect in components)
      setCurrentCompetition(competition);
      secureStorage.setItem(`${userType}_current_competition`, JSON.stringify(competition));
      logger.info('Competition state updated', { competitionId, competitionName: competition.name });
    } catch (err) {
      logger.error('Failed to switch competition:', err);
      // Don't revert anything since we didn't do optimistic update
      setError(err.response?.data?.message || 'Failed to switch competition');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userType, getToken, assignedCompetitions, isLoading, currentCompetition]);

  // Clear competition context (for logout)
  const clearCompetitionContext = useCallback(() => {
    setCurrentCompetition(null);
    setAssignedCompetitions([]);
    setSelectedLevelState(null);
    setError(null);
    if (userType) {
      secureStorage.removeItem(`${userType}_current_competition`);
      secureStorage.removeItem(`${userType}_selected_level`);
    }
  }, [userType]);

  // When auth user type clears (logout), drop in-memory competition state so
  // a new login does not inherit the previous session's selection.
  //
  // The level is re-read rather than only cleared: this provider is mounted for
  // the life of the app, so a logout followed by a sign-in as a DIFFERENT role
  // arrives here as a userType change, not a remount. Without the re-read the
  // level state would still hold whatever the first role picked.
  useEffect(() => {
    if (!userType) {
      setCurrentCompetition(null);
      setAssignedCompetitions([]);
      setSelectedLevelState(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setSelectedLevelState(getStoredLevel(userType));
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
      
      logger.info('CompetitionProvider: Loading competitions', {
        userType,
        pendingCompetitionId,
        hasToken: !!getToken()
      });

      try {
        setIsLoading(true);
        setError(null);

        const response = await authAPI.getAssignedCompetitions();

        if (!isMounted) return;

        const responseData = response.data.data || response.data;
        const competitions = responseData.competitions || [];
        
        logger.info('CompetitionProvider: Competitions loaded', {
          count: competitions.length,
          competitionIds: competitions.map(c => c._id)
        });
        
        finalizeAssignmentsFromApi(competitions);

        // No competition in JWT: auto-select when exactly one assigned
        if (!getCompetitionFromToken()) {
          /*
           * NOT WHILE THE USER IS CHOOSING.
           *
           * `/auth/set-competition` does not merely return a token — it sets the
           * httpOnly access-token COOKIE, and `auth.middleware` trusts the
           * cookie ABOVE the Authorization header. So this call re-scopes the
           * whole session server-side, and no amount of care with what the
           * client stores can undo that.
           *
           * It fires when exactly one meet is assigned, which for a coach is
           * precisely the moment they are entering their second: they hold one
           * entry and are standing on the chooser picking another. It raced
           * their choice and won, because it set a cookie that outranks
           * everything, and every squad place they then added was written to
           * the meet they had just left. It cost the second meet of every level
           * — in a twelve-meet seed, four silent losses with nothing failing.
           *
           * Auto-select exists so somebody with ONE meet does not have to pick
           * it. On a screen whose entire purpose is picking, that convenience
           * is not just unnecessary, it is the bug.
           */
          const choosing = /\/select-(level|competition)$/.test(pathnameRef.current);

          if (choosing) {
            logger.info('Skipping auto-select — the user is on the chooser', {
              path: pathnameRef.current,
            });
            setCurrentCompetition(null);
          } else if (competitions.length === 1) {
            const competition = competitions[0];
            logger.info('Auto-selecting single competition', {
              competitionId: competition._id,
              competitionName: competition.name,
              userType
            });

            try {
              const response = await authAPI.setCompetition(competition._id);

              /*
               * Defence in depth for the paths the chooser check above does not
               * cover: a competitionId present now means somebody chose while
               * this was in flight, and a deliberate choice always beats a
               * convenience default.
               *
               * Note this can only protect what the CLIENT stores. The cookie
               * the request just set is already there either way, which is why
               * not making the request is the actual fix.
               */
              if (!isMounted) return;
              if (getCompetitionFromToken()) {
                logger.info('Auto-select superseded by an explicit choice — leaving it alone', {
                  wouldHaveSet: competition._id,
                });
              } else {
                const newToken = response.data.data?.token || response.data.token;
                secureStorage.setItem(`${userType}_token`, newToken);
                setCurrentCompetition(competition);
                logger.info('Competition auto-selected and token updated', { competitionId: competition._id });
              }
            } catch (err) {
              logger.error('Failed to update token after auto-select:', err);
            }
          } else {
            setCurrentCompetition(null);
          }
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
  }, [userType, competitionIdInToken, getToken, getCompetitionFromToken, finalizeAssignmentsFromApi]);

  const value = {
    currentCompetition,
    assignedCompetitions,
    selectedLevel,
    competitionsForSelectedLevel,
    setSelectedLevel,
    clearSelectedLevel,
    isLoading,
    error,
    switchCompetition,
    fetchAssignedCompetitions,
    mergeAssignedAndSelectCompetition,
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
