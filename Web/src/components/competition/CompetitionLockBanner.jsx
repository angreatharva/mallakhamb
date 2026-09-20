import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';

import SafeText from '@/components/auth/SafeText';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { COLORS } from '@/styles/tokens';

/**
 * "This meet has closed."
 *
 * Shown at the top of any screen that can write to a competition, once the
 * competition has passed 23:59 UTC on its end date. Renders NOTHING when the
 * meet is still open, and nothing for a super admin — they keep every write,
 * so telling them the meet is locked would be false.
 *
 * The server refuses the writes either way (423 `COMPETITION_LOCKED`). This is
 * here so a judge does not fill in a whole score sheet before finding out, and
 * so an admin looking at frozen results knows why the buttons do nothing rather
 * than assuming the app is broken.
 *
 * Deliberately not a toast: this is a standing state of the screen, not an
 * event, and it has to still be on display after the user scrolls, navigates
 * within the section, or comes back to the tab.
 *
 * @param {Object} props
 * @param {Object} [props.competition] - the meet, when the caller already has it
 * @param {string} [props.className]
 */
const CompetitionLockBanner = ({ competition, className = '' }) => {
  const { locked, closedOn, competitionName } = useCompetitionLock({ competition });

  if (!locked) return null;

  return (
    <motion.div
      role="status"
      className={`rounded-2xl border overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(248,113,113,0.10), rgba(255,255,255,0.02))',
        borderColor: 'rgba(248,113,113,0.28)',
      }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(248,113,113,0.15)' }}
        >
          <Lock className="w-4 h-4" style={{ color: '#F87171' }} aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight">
            {competitionName ? <SafeText as="span">{competitionName}</SafeText> : 'This competition'}
            {' has closed'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {closedOn
              ? `Entries, scores and running orders were locked at the end of ${closedOn}. `
              : 'Entries, scores and running orders are locked. '}
            Results are read-only — only a super admin can make further changes.
          </p>
        </div>
      </div>

      <div
        className="h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${COLORS.saffron}30, transparent)` }}
      />
    </motion.div>
  );
};

export default CompetitionLockBanner;
