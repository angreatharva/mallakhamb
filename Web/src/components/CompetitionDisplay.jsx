import React from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { Calendar, MapPin, Trophy, Zap, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import SafeText from './SafeText';
import { COLORS } from '../pages/public/Home';

void motion;

const statusConfig = {
  ongoing: { color: '#22C55E', label: 'Live', pulse: true },
  upcoming: { color: '#3B82F6', label: 'Upcoming', pulse: false },
  completed: { color: 'rgba(255,255,255,0.3)', label: 'Completed', pulse: false },
};

const CompetitionDisplay = ({ className = '' }) => {
  const { currentCompetition, isLoading } = useCompetition();

  if (isLoading || !currentCompetition) return null;

  const status = statusConfig[currentCompetition.status] || statusConfig.completed;

  return (
    <motion.div
      className={`relative rounded-2xl border overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${COLORS.saffron}08, rgba(255,255,255,0.02))`,
        borderColor: `${COLORS.saffron}20`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Top shimmer line */}
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.saffron}50, transparent)` }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${COLORS.saffron}18` }}>
              <Trophy className="w-4 h-4" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm leading-tight truncate">
                <SafeText>{currentCompetition.name}</SafeText>
                {currentCompetition.year ? ` (${currentCompetition.year})` : ''}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {currentCompetition.place && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    <SafeText as="span">{currentCompetition.place}</SafeText>
                  </span>
                )}
                {currentCompetition.level && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                    style={{ background: `${COLORS.saffron}15`, color: COLORS.saffronLight }}>
                    {currentCompetition.level}
                  </span>
                )}
                {currentCompetition.startDate && currentCompetition.endDate && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
            style={{ background: `${status.color}15`, border: `1px solid ${status.color}30` }}>
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
              <Clock className="w-3 h-3" style={{ color: status.color }} aria-hidden="true" />
            )}
            <span className="text-xs font-bold" style={{ color: status.color }}>{status.label}</span>
          </div>
        </div>

        {currentCompetition.description && (
          <SafeText as="p" className="mt-3 text-xs leading-relaxed line-clamp-2"
            style={{ color: 'rgba(255,255,255,0.35)' }}>
            {currentCompetition.description}
          </SafeText>
        )}
      </div>
    </motion.div>
  );
};

export default CompetitionDisplay;
