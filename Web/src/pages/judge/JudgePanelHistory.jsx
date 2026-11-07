import { useState } from 'react';
import PropTypes from 'prop-types';
import { EmptyState, Heading, Panel, SearchField, StatusTag, Tag } from '@/components/ui';
import { matchesSearch } from '@/utils/ui/search';
import { levelLabel } from '@/utils/competition/levels';
import { isCompetitionLocked } from '@/utils/scoring/competitionLock';
import { ageGroupMapping } from '@/hooks/useAgeGroups';
import { COMPETITION_TYPES } from './judgeCategoryOptions';

const typeLabel = (value) => COMPETITION_TYPES.find((t) => t.value === value)?.label || value;

const formatDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "12 Jan 2026 – 14 Jan 2026", or just the one day, or nothing. */
const dateRange = (competition) => {
  const start = formatDay(competition?.startDate);
  const end = formatDay(competition?.endDate);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end;
};

/**
 * Seats grouped by meet, in the order the server sends them (newest meet
 * first). A seat whose meet could not be resolved arrives with a bare id; it
 * is grouped under that id with a neutral name rather than dropped.
 *
 * @param {Array} assignments - `GET /judge/profile` → `assignments`
 * @returns {Array<{ id: string, competition: Object|null, seats: Array }>}
 */
export const groupSeatsByMeet = (assignments = []) => {
  const groups = new Map();
  assignments.forEach((seat) => {
    const competition = seat.competition && typeof seat.competition === 'object' ? seat.competition : null;
    const id = String(competition?._id ?? seat.competition ?? 'unknown');
    if (!groups.has(id)) groups.set(id, { id, competition, seats: [] });
    groups.get(id).seats.push(seat);
  });
  return [...groups.values()];
};

/** One seat: the role first, then the category it covers. */
const SeatLine = ({ seat }) => {
  const category = [
    seat.gender,
    seat.ageGroup ? (ageGroupMapping[seat.ageGroup]?.label || seat.ageGroup) : null,
    (seat.competitionTypes || []).map(typeLabel).join(', ') || null,
    seat.apparatus || null,
  ].filter(Boolean);
  return (
    <li className="py-3 border-b border-line last:border-b-0 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-4 sm:items-baseline">
      <span className="type-body-s font-semibold text-fg">{seat.judgeType || 'Panel seat'}</span>
      <span className="type-body-s text-fg-muted break-words">{category.join(' · ') || 'Whole competition'}</span>
    </li>
  );
};
SeatLine.propTypes = { seat: PropTypes.object.isRequired };

/**
 * Every panel this judge has sat on, by meet. Read-only: seats are given by
 * organisers, and a finished meet is marked so it is clear nothing there can
 * change.
 */
const JudgePanelHistory = ({ assignments = [], title = 'Your panels', headingLevel = 2 }) => {
  const groups = groupSeatsByMeet(assignments);
  const [query, setQuery] = useState('');
  const shown = groups.filter(({ competition }) => matchesSearch(
    query, competition?.name, competition?.place, competition?.year, competition?.level && levelLabel(competition.level),
  ));

  return (
    <section aria-labelledby="judge-panels-title" className="grid gap-4">
      <Heading level={headingLevel} step="display-s" id="judge-panels-title" className="m-0">{title}</Heading>
      {groups.length === 0 ? (
        <EmptyState tag="No panels yet">
          You haven&apos;t sat on a panel yet. Competitions you judge will be listed here, including finished ones.
        </EmptyState>
      ) : (
        <>
        <SearchField value={query} onChange={setQuery} placeholder="Search competitions by name, place or level…" label="Search competitions" />
        {shown.length === 0 && <p className="type-body-s text-fg-muted m-0">No competitions match &quot;{query}&quot;.</p>}
        <ul className="grid gap-4 m-0 p-0 list-none" data-testid="judge-panel-history">
          {shown.map(({ id, competition, seats }) => {
            const finished = competition ? isCompetitionLocked(competition) : false;
            const meta = [
              competition?.level ? `${levelLabel(competition.level)} level` : null,
              competition?.place,
              dateRange(competition),
            ].filter(Boolean).join(' · ');
            return (
              <li key={id}>
                <Panel className="grid gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 grid gap-1">
                      <Heading level={headingLevel + 1} step="body" asIs className="m-0 font-bold break-words">
                        {competition?.name || 'Competition'}
                      </Heading>
                      {meta && <p className="type-caption text-fg-muted m-0">{meta}</p>}
                    </div>
                    {finished
                      ? <Tag>Completed · view only</Tag>
                      : <StatusTag status="info">Current</StatusTag>}
                  </div>
                  <ul className="m-0 p-0 list-none">
                    {seats.map((seat) => <SeatLine key={String(seat._id ?? `${seat.judgeType}-${seat.gender}-${seat.ageGroup}`)} seat={seat} />)}
                  </ul>
                </Panel>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </section>
  );
};

JudgePanelHistory.propTypes = {
  assignments: PropTypes.array,
  title: PropTypes.node,
  headingLevel: PropTypes.number,
};

export default JudgePanelHistory;
