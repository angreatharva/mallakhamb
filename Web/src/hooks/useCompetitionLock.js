/**
 * Is the meet this screen is working on frozen?
 *
 * A competition locks at 23:59 UTC on its end date. After that the server
 * refuses every write with a 423 — see
 * `Server/src/middleware/competition-lock.middleware.js`. This hook is how the
 * UI finds out BEFORE the user fills in a score sheet, so screens can render
 * read-only instead of failing at save time.
 *
 * It is presentation only. Nothing here decides whether a write is allowed;
 * the server does that whatever the browser believes.
 *
 * ── Why it reads two different places ──────────────────────────────────────
 *
 * The current meet lives in one of two places depending on who is signed in,
 * and that split is not this hook's invention:
 *
 *  - admin / superadmin / coach / player — `CompetitionContext`, which fetches
 *    the assigned list and tracks the selection.
 *  - judge — `secureStorage['judge_current_competition']`. `CompetitionProvider`
 *    deliberately skips its fetch for judges (a judge's meets come from their
 *    SEATS, not from an assigned-competitions endpoint), so its
 *    `currentCompetition` is always null for them. `JudgeDashboard` writes the
 *    full record there when the session's meet is chosen.
 *
 * Pass `competition` explicitly when the caller already holds the record —
 * `JudgeDashboard` has it in state as `activeCompetition`, and reading state is
 * better than reading storage it just wrote.
 *
 * @module hooks/useCompetitionLock
 */

import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { describeCompetitionLock, formatLockDate } from '@/utils/scoring/competitionLock';

/** Where a judge session keeps its meet. Written by `JudgeDashboard`. */
const JUDGE_COMPETITION_KEY = 'judge_current_competition';

/**
 * @param {Object} [options]
 * @param {Object} [options.competition] - the meet, when the caller already has it
 * @returns {{
 *   locked: boolean,
 *   locksAt: Date | null,
 *   closedOn: string | null,
 *   competition: Object | null,
 *   competitionName: string | null
 * }}
 */
export function useCompetitionLock({ competition: explicit } = {}) {
  const { userType } = useAuth();
  const { currentCompetition } = useCompetition();

  /*
   * Read once per (userType, selection) rather than on every render: this is a
   * synchronous storage read and a JSON.parse, and the judge scoring sheet
   * re-renders on every keystroke.
   */
  const competition = useMemo(() => {
    if (explicit) return explicit;
    if (currentCompetition) return currentCompetition;
    if (userType !== 'judge') return null;

    try {
      const stored = secureStorage.getItem(JUDGE_COMPETITION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      // Unreadable storage means "we do not know", which must read as UNLOCKED
      // — the server is still the thing that refuses the write, and a screen
      // greyed out because a JSON parse failed would be unrecoverable from the
      // UI. Same fail-open reasoning as a competition with no end date.
      return null;
    }
  }, [explicit, currentCompetition, userType]);

  return useMemo(() => {
    const { locked, locksAt } = describeCompetitionLock(competition, userType);
    return {
      locked,
      locksAt,
      closedOn: locksAt ? formatLockDate(locksAt) : null,
      competition,
      competitionName: competition?.name || null,
    };
  }, [competition, userType]);
}

export default useCompetitionLock;
