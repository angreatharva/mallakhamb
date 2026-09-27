import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Layers, ArrowRight, Check, Trophy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompetition } from '@/contexts/CompetitionContext';
import { coachAPI, playerAPI } from '@/services/api';
import { judgeAPI } from '@/services/public/judge.api';
import { logger } from '@/infrastructure/logger';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { GradientText, FadeIn } from '@/components/design-system';
import { AmbientOrbs, ORB_INTENSITY } from '@/components/design-system/backgrounds';
import { COMPETITION_LEVELS, LEVEL_META, countByLevel } from '@/utils/competition/levels';

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

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

// ─── Level card ───────────────────────────────────────────────────────────────

const LevelCard = ({ level, count, counting = false, isSelected, onSelect, disabled, index }) => {
  const reduced = useReducedMotion();
  const meta = LEVEL_META[level];
  const isEmpty = !counting && count === 0;

  return (
    <motion.button
      onClick={() => onSelect(level)}
      disabled={disabled}
      className="w-full text-left rounded-2xl border relative overflow-hidden transition-all duration-200 focus:outline-none"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${COLORS.saffron}12, rgba(255,255,255,0.03))`
          : 'rgba(255,255,255,0.03)',
        borderColor: isSelected ? `${COLORS.saffron}45` : COLORS.darkBorderSubtle,
        boxShadow: isSelected ? `0 0 0 1px ${COLORS.saffron}20, 0 8px 32px ${COLORS.saffron}10` : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        // Empty levels stay selectable on purpose — see the note on the counts
        // below — but they are visibly quieter than levels with meets behind them.
        opacity: isEmpty && !isSelected ? 0.55 : 1,
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: EASE_OUT }}
      whileHover={disabled ? {} : {
        borderColor: `${COLORS.saffron}35`,
        background: `linear-gradient(135deg, ${COLORS.saffron}08, rgba(255,255,255,0.03))`,
        y: -2,
      }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      aria-pressed={isSelected}
    >
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${COLORS.saffron}60, transparent)` }} />
      )}

      <div className="p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: isSelected ? `${COLORS.saffron}20` : 'rgba(255,255,255,0.06)' }}>
          <Layers className="w-5 h-5"
            style={{ color: isSelected ? COLORS.saffron : 'rgba(255,255,255,0.4)' }} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight">{meta.label}</h3>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {meta.blurb}
          </p>
          {counting ? (
            // The meets are still being fetched: say so, rather than showing a
            // "0 competitions" that turns into a real number a moment later.
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}
              role="status" aria-label={`Counting ${meta.label} competitions`}>
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              Counting…
            </span>
          ) : (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
              style={{
                background: isEmpty ? 'rgba(255,255,255,0.05)' : `${COLORS.saffron}12`,
                color: isEmpty ? 'rgba(255,255,255,0.35)' : COLORS.saffronLight,
              }}>
              {count === 1 ? '1 competition' : `${count} competitions`}
            </span>
          )}
        </div>

        {isSelected && (
          <motion.div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: COLORS.saffron }}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </motion.div>
        )}
      </div>
    </motion.button>
  );
};

LevelCard.propTypes = {
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
  const [pendingLevel, setPendingLevel] = useState(selectedLevel);
  const [scopedCompetitions, setScopedCompetitions] = useState(null);
  const [scopedLoading, setScopedLoading] = useState(false);
  useReducedMotion();

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
    navigate(SELECT_COMPETITION_PATH[userType] || '/');
  };

  // Only a first load with nothing to show yet takes the whole screen; while
  // counting, the cards are drawn and each count shows its own spinner.
  if (!fetchesOwnList && isLoading && !assignedCompetitions?.length) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}30` }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} />
          </motion.div>
          <p className="text-white/50 text-sm">Loading levels...</p>
        </div>
      </div>
    );
  }

  return (
    // `h-dvh` with the card region as the only scrolling child, matching
    // CompetitionSelectionScreen — growing the page instead pushes the primary
    // action past the fold on a short viewport.
    <div className="h-dvh relative overflow-hidden" style={{ background: COLORS.dark }}>
      <AmbientOrbs
        intensity={ORB_INTENSITY.warm}
        orbs={[
          { x: 15, y: 20, size: 400, color: COLORS.saffron, delay: 0 },
          { x: 85, y: 70, size: 300, color: COLORS.gold, delay: 2 },
        ]}
      />

      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }} />

      <div className="relative z-10 h-full flex flex-col items-center p-4 py-8 md:py-10 [@media(max-height:700px)]:py-4">
        <div className="w-full max-w-3xl flex-1 min-h-0 flex flex-col justify-center">
          <FadeIn className="text-center mb-8 shrink-0 [@media(max-height:700px)]:mb-5 [@media(max-height:500px)]:mb-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-5 border [@media(max-height:500px)]:hidden"
              style={{ background: `${COLORS.saffron}12`, borderColor: `${COLORS.saffron}35`, color: COLORS.saffronLight }}>
              <Layers className="w-3 h-3" aria-hidden="true" />
              Level Selection
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight [@media(max-height:500px)]:text-2xl [@media(max-height:500px)]:mb-1">
              Choose Your <GradientText>Level</GradientText>
            </h1>
            <p className="text-white/40 text-base max-w-md mx-auto [@media(max-height:500px)]:hidden">
              Competitions are organised by level. Pick one to see its meets.
            </p>
          </FadeIn>

          <div className="min-h-0 overflow-y-auto mb-6 py-1 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {COMPETITION_LEVELS.map((level, i) => (
                <LevelCard
                  key={level}
                  level={level}
                  count={counts[level]}
                  counting={counting}
                  isSelected={pendingLevel === level}
                  onSelect={setPendingLevel}
                  index={i}
                />
              ))}
            </div>
          </div>

          <FadeIn delay={0.2} className="flex justify-center shrink-0">
            <motion.button
              onClick={handleContinue}
              disabled={!pendingLevel}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-sm min-h-[52px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: pendingLevel
                  ? `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`
                  : 'rgba(255,255,255,0.08)',
                border: `1px solid ${pendingLevel ? 'transparent' : COLORS.darkBorderSubtle}`,
              }}
              whileHover={pendingLevel ? { scale: 1.02 } : {}}
              whileTap={pendingLevel ? { scale: 0.97 } : {}}
            >
              Continue
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

LevelSelectionScreen.propTypes = {
  userType: PropTypes.string.isRequired,
};

export default LevelSelectionScreen;
