import { useCompetition } from '@/contexts/CompetitionContext';
import { Calendar, MapPin, Lock } from 'lucide-react';
import SafeText from '@/components/auth/SafeText';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { levelLabel } from '@/utils/competition/levels';
import { Panel, StatusTag, Tag } from '@/components/ui';

const statusConfig = {
  ongoing: { status: 'success', label: 'Live' },
  upcoming: { status: 'info', label: 'Upcoming' },
  completed: { status: null, label: 'Completed' },
};

/**
 * The badge a frozen meet gets, whatever its stored `status` says.
 *
 * `status` is a field somebody sets; the lock is a fact about the calendar, and
 * the two disagree all the time — a meet whose end date has passed while the
 * record still reads `ongoing` is the normal case, because nothing updates that
 * field automatically. The badge shows the one the user cannot change.
 */
const lockedStatus = { status: 'danger', label: 'Locked', icon: Lock };

/**
 * The current competition, as the lower third over a dashboard: a feature
 * panel (the 3px accent rule), the name in its own case, place, level, dates
 * and the status as text.
 */
const CompetitionDisplay = ({ className = '' }) => {
  const { currentCompetition, isLoading } = useCompetition();
  const { locked } = useCompetitionLock({ competition: currentCompetition });

  if (isLoading || !currentCompetition) return null;

  const status = locked
    ? lockedStatus
    : statusConfig[currentCompetition.status] || statusConfig.completed;
  const StatusIcon = status.icon || null;

  return (
    <Panel variant="feature" key={currentCompetition._id} className={`ui-fade-in ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 grid gap-2">
          <h3 className="m-0 text-fg font-bold text-base leading-tight truncate">
            <SafeText>{currentCompetition.name}</SafeText>
            {currentCompetition.year ? ` (${currentCompetition.year})` : ''}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-s text-fg-muted">
            {currentCompetition.place && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <SafeText as="span">{currentCompetition.place}</SafeText>
              </span>
            )}
            {currentCompetition.level && <Tag>{levelLabel(currentCompetition.level)}</Tag>}
            {currentCompetition.startDate && currentCompetition.endDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                {new Date(currentCompetition.startDate).toLocaleDateString()} –{' '}
                {new Date(currentCompetition.endDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {status.status ? (
          <StatusTag status={status.status} className="flex-shrink-0">
            {StatusIcon && <StatusIcon className="w-3 h-3" aria-hidden="true" />}
            {status.label}
          </StatusTag>
        ) : (
          <Tag className="flex-shrink-0">{status.label}</Tag>
        )}
      </div>

      {currentCompetition.description && (
        <SafeText as="p" className="mt-3 mb-0 type-body-s text-fg-muted line-clamp-2">
          {currentCompetition.description}
        </SafeText>
      )}
    </Panel>
  );
};

export default CompetitionDisplay;
