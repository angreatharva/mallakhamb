import { Lock } from 'lucide-react';

import SafeText from '@/components/auth/SafeText';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';

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

  // A Notice's anatomy (the 3px danger rule), with the heading the screens
  // have always had. The meet's name keeps its own case.
  return (
    <div role="status" className={`ui-notice ui-notice--danger ui-fade-in ${className}`}>
      <h3 className="ui-notice__title m-0 flex items-center gap-2 text-sm font-bold normal-case tracking-normal">
        <Lock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span>
          {competitionName ? <SafeText as="span">{competitionName}</SafeText> : 'This competition'}
          {' has closed'}
        </span>
      </h3>
      <p className="ui-notice__text type-body-s m-0">
        {closedOn
          ? `Entries, scores and running orders were locked at the end of ${closedOn}. `
          : 'Entries, scores and running orders are locked. '}
        Results are read-only — only a super admin can make further changes.
      </p>
    </div>
  );
};

export default CompetitionLockBanner;
