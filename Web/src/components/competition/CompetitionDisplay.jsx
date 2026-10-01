import { useCompetition } from '@/contexts/CompetitionContext';
import { Calendar, MapPin, Trophy, Clock, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import SafeText from '@/components/auth/SafeText';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { COLORS, alpha } from '@/styles/tokens';
import { levelLabel } from '@/utils/competition/levels';


const statusConfig = {
  ongoing: { color: 'rgb(var(--success-fg))', label: 'Live', pulse: true },
  upcoming: { color: 'rgb(var(--info-fg))', label: 'Upcoming', pulse: false },
  completed: { color: 'var(--fg-muted)', label: 'Completed', pulse: false },
};

/**
 * The badge a frozen meet gets, whatever its stored `status` says.
 *
 * `status` is a field somebody sets; the lock is a fact about the calendar, and
 * the two disagree all the time — a meet whose end date has passed while the
 * record still reads `ongoing` is the normal case, because nothing updates that
 * field automatically. The badge shows the one the user cannot change.
 */
const lockedStatus = { color: 'rgb(var(--danger-fg-soft))', label: 'Locked', pulse: false, icon: Lock };

const CompetitionDisplay = ({ className = '' }) => {
  const { currentCompetition, isLoading } = useCompetition();
  const { locked } = useCompetitionLock({ competition: currentCompetition });

  if (isLoading || !currentCompetition) return null;

  const status = locked
    ? lockedStatus
    : statusConfig[currentCompetition.status] || statusConfig.completed;
  const StatusIcon = status.icon || Clock;

  return (
    <motion.div
      key={currentCompetition._id}
      className={`relative rounded-2xl border overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${alpha(COLORS.saffron, 0x08)}, rgb(var(--ink) / 0.02))`,
        borderColor: `${alpha(COLORS.saffron, 0x20)}`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Top shimmer line */}
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${alpha(COLORS.saffron, 0x50)}, transparent)` }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${alpha(COLORS.saffron, 0x18)}` }}>
              <Trophy className="w-4 h-4" style={{ color: 'rgb(var(--brand-fg))' }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm leading-tight truncate">
                <SafeText>{currentCompetition.name}</SafeText>
                {currentCompetition.year ? ` (${currentCompetition.year})` : ''}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {currentCompetition.place && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
                    <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    <SafeText as="span">{currentCompetition.place}</SafeText>
                  </span>
                )}
                {currentCompetition.level && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: `${alpha(COLORS.saffron, 0x15)}`, color: 'rgb(var(--brand-fg-soft))' }}>
                    {levelLabel(currentCompetition.level)}
                  </span>
                )}
                {currentCompetition.startDate && currentCompetition.endDate && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
                    <Calendar className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    {new Date(currentCompetition.startDate).toLocaleDateString()} –{' '}
                    {new Date(currentCompetition.endDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: `${alpha(status.color, 0x15)}`, border: `1px solid ${alpha(status.color, 0x30)}` }}>
            {status.pulse ? (
              <span className="relative flex w-2 h-2">
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: status.color }}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: status.color }} />
              </span>
            ) : (
              <StatusIcon className="w-3 h-3" style={{ color: status.color }} aria-hidden="true" />
            )}
            <span className="text-xs font-bold" style={{ color: status.color }}>{status.label}</span>
          </div>
        </div>

        {currentCompetition.description && (
          <SafeText as="p" className="mt-3 text-xs leading-relaxed line-clamp-2"
            style={{ color: 'var(--fg-muted)' }}>
            {currentCompetition.description}
          </SafeText>
        )}
      </div>
    </motion.div>
  );
};

export default CompetitionDisplay;
