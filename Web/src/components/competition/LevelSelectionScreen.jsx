import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { playerHasTeam } from '@/utils/auth/playerTeam';
import { coachAPI, playerAPI } from '@/services/api';
import { judgeAPI } from '@/services/public/judge.api';
import { logger } from '@/infrastructure/logger';
import { COMPETITION_LEVELS, LEVEL_META, countByLevel } from '@/utils/competition/levels';
import { Button, Heading, RunningOrder, RunningOrderItem, Tag } from '@/components/ui';

/**
 * Where each role goes once a level is chosen.
 *
 * Superadmin is absent deliberately: they are not scoped to assigned meets and
 * go straight to their dashboard, so they never reach this screen.
 */
const SELECT_COMPETITION_PATH = {
  admin: '/admin/select-competition',
  coach: '/coach/select-competition',
  player: '/player/select-competition',
  judge: '/judge/select-competition',
};

// ─── Level row ────────────────────────────────────────────────────────────────

/** One level in the running order: its name, its blurb, and how many meets it holds. */
const LevelRow = ({ level, count, counting = false, isSelected, onSelect, disabled, index }) => {
  const meta = LEVEL_META[level];
  const isEmpty = !counting && count === 0;

  return (
    <RunningOrderItem
      index={index + 1}
      title={meta.label}
      titleAs="h3"
      meta={meta.blurb}
      selected={isSelected}
      // Empty levels stay selectable on purpose — see the note on the counts
      // below — but they are visibly quieter than levels with meets behind them.
      muted={isEmpty}
      disabled={disabled}
      onClick={() => onSelect(level)}
      aside={counting ? (
        // The meets are still being fetched: say so, rather than showing a
        // "0 competitions" that turns into a real number a moment later.
        <Tag role="status" aria-label={`Counting ${meta.label} competitions`}>
          <span className="ui-spinner" aria-hidden="true" />
          Counting…
        </Tag>
      ) : (
        <Tag tone={isEmpty ? 'neutral' : 'accent'}>
          {count === 1 ? '1 competition' : `${count} competitions`}
        </Tag>
      )}
    />
  );
};

LevelRow.propTypes = {
  level: PropTypes.oneOf(COMPETITION_LEVELS).isRequired,
  count: PropTypes.number.isRequired,
  counting: PropTypes.bool,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  index: PropTypes.number.isRequired,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

/**
 * Step one of the post-login flow, for every role: choose the level, then
 * choose a competition from that level only.
 *
 * The level is a FILTER, not a permission. Picking "national" grants nothing —
 * what a user may act on is still decided by the checks that already existed
 * (an admin's assignment list, a judge's panel seats). This screen only narrows
 * what the next one offers.
 *
 * @param {{ userType: string }} props
 */
const LevelSelectionScreen = ({ userType }) => {
  const navigate = useNavigate();
  const { assignedCompetitions, selectedLevel, setSelectedLevel, isLoading } = useCompetition();
  const { user } = useAuth();
  const [pendingLevel, setPendingLevel] = useState(selectedLevel);
  const [scopedCompetitions, setScopedCompetitions] = useState(null);
  const [scopedLoading, setScopedLoading] = useState(false);

  /*
   * Counts come from whichever list this role will actually be choosing from on
   * the next screen, so the number on a card matches what lands behind it.
   *
   * Coaches and players choose from the OPEN competitions — a coach registers a
   * team into a meet they have never been part of, and a player joins a squad in
   * one. `assignedCompetitions` is the wrong list for them: it holds the meets
   * they are ALREADY in, which for a new account is none, and would label every
   * level "0 competitions" on the way into a flow that works fine.
   *
   * Judges are skipped by CompetitionContext entirely (it early-returns on
   * userType 'judge'), because a judge's meets are their panel seats and live
   * behind a different endpoint.
   */
  useEffect(() => {
    let cancelled = false;

    const loadScoped = async () => {
      if (!['coach', 'player', 'judge'].includes(userType)) {
        setScopedCompetitions(null);
        return;
      }

      setScopedLoading(true);
      try {
        const fetcher = {
          coach: () => coachAPI.getOpenCompetitions(),
          player: () => playerAPI.getOpenCompetitions(),
          judge: () => judgeAPI.getAssignedCompetitions(),
        }[userType];

        const response = await fetcher();
        const payload = response.data?.data ?? response.data ?? [];
        if (!cancelled) setScopedCompetitions(Array.isArray(payload) ? payload : []);
      } catch (err) {
        logger.error('[Level Selection] Failed to load competitions for counts', err);
        /*
         * Counts are a convenience, not a gate. A failure here leaves them
         * unknown and every level still selectable — the competition screen
         * fetches its own list and will report the real error there, which is
         * a far better place to surface it than a chooser the user has not
         * committed to yet.
         */
        if (!cancelled) setScopedCompetitions([]);
      } finally {
        if (!cancelled) setScopedLoading(false);
      }
    };

    loadScoped();
    return () => { cancelled = true; };
  }, [userType]);

  const sourceCompetitions = scopedCompetitions ?? assignedCompetitions;
  const counts = useMemo(() => countByLevel(sourceCompetitions), [sourceCompetitions]);

  /*
   * Still counting? Coach, player and judge fetch their own list, so until it
   * arrives the answer is "loading" — not the shared context's flag, which for
   * them had already settled and let every card show "0 competitions" for as
   * long as the fetch took. Admins count from the context.
   */
  const fetchesOwnList = ['coach', 'player', 'judge'].includes(userType);
  const counting = fetchesOwnList ? (scopedCompetitions === null || scopedLoading) : isLoading;

  const handleContinue = () => {
    if (!pendingLevel) {
      toast.error('Please select a level');
      return;
    }
    setSelectedLevel(pendingLevel);
    logger.log('[Level Selection] Level chosen', { userType, level: pendingLevel });
    // A player picks their team before the meet: Level → Team → Competition.
    // The meets offered are then the ones that team is entered in.
    if (userType === 'player' && !playerHasTeam(user)) {
      navigate('/player/select-team');
      return;
    }
    navigate(SELECT_COMPETITION_PATH[userType] || '/');
  };

  // Only a first load with nothing to show yet takes the whole screen; while
  // counting, the rows are drawn and each count shows its own spinner.
  if (!fetchesOwnList && isLoading && !assignedCompetitions?.length) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading levels...
        </p>
      </div>
    );
  }

  return (
    // `h-dvh` with the row region as the only scrolling child, matching
    // CompetitionSelectionScreen — growing the page instead pushes the primary
    // action past the fold on a short viewport.
    <div className="h-dvh bg-bg text-fg">
      <div className="h-full flex flex-col items-center px-[var(--pad)] py-8 md:py-10 [@media(max-height:700px)]:py-4">
        <div className="w-full max-w-3xl flex-1 min-h-0 flex flex-col justify-center">
          <header className="grid justify-items-start gap-3 mb-8 shrink-0 [@media(max-height:700px)]:mb-5 [@media(max-height:500px)]:mb-3">
            <Tag tone="accent" className="[@media(max-height:500px)]:hidden">Level Selection</Tag>
            <Heading level={1} step="display-l" className="ui-wipe-in">Choose Your Level</Heading>
            <p className="type-body text-fg-muted max-w-md m-0 [@media(max-height:500px)]:hidden">
              Competitions are organised by level. Pick one to see its meets.
            </p>
          </header>

          <div className="min-h-0 overflow-y-auto mb-6">
            <RunningOrder label="Competition levels">
              {COMPETITION_LEVELS.map((level, i) => (
                <LevelRow
                  key={level}
                  level={level}
                  count={counts[level]}
                  counting={counting}
                  isSelected={pendingLevel === level}
                  onSelect={setPendingLevel}
                  index={i}
                />
              ))}
            </RunningOrder>
          </div>

          <div className="flex justify-end shrink-0">
            <Button size="lg" onClick={handleContinue} disabled={!pendingLevel} iconRight={ArrowRight}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

LevelSelectionScreen.propTypes = {
  userType: PropTypes.string.isRequired,
};

export default LevelSelectionScreen;
