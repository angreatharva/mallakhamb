import PropTypes from 'prop-types';
import { Select } from '@/components/ui';
import { APPARATUS, apparatusLabel, shortDate, viz } from '@/components/charts/chartTheme';

/**
 * The one filter row above every Stats tab: which meet (all, or one), which
 * apparatus, and — for a coach — which team. Every chart below reads the same
 * selection.
 */
const StatsFilters = ({ meets, meet, onMeet, apparatus = null, selected = new Set(), onToggleApparatus = null, teams = null, team = 'all', onTeam = null, allLabel = 'All competitions' }) => (
  <div className="flex flex-wrap items-end gap-x-6 gap-y-3" role="group" aria-label="Filters">
    <label className="grid gap-1 min-w-[min(100%,260px)]">
      <span className="type-tag text-fg-secondary">Competition</span>
      <Select value={meet} onChange={(e) => onMeet(e.target.value)}>
        <option value="all">{allLabel}</option>
        {meets.map((m) => (
          <option key={m.id} value={m.id}>{m.name}{m.date ? ` · ${shortDate(m.date)}` : ''}</option>
        ))}
      </Select>
    </label>

    {teams && teams.length > 1 && (
      <label className="grid gap-1 min-w-[min(100%,200px)]">
        <span className="type-tag text-fg-secondary">Team</span>
        <Select value={team} onChange={(e) => onTeam(e.target.value)}>
          <option value="all">All my teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </label>
    )}

    {apparatus && apparatus.length > 1 && onToggleApparatus && (
      <fieldset className="grid gap-1 border-0 p-0 m-0">
        <legend className="type-tag text-fg-secondary mb-1">Apparatus</legend>
        <div className="flex flex-wrap gap-2">
          {apparatus.map((key) => {
            const on = selected.size === 0 || selected.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleApparatus(key)}
                className={`ui-btn ui-btn--sm ${on ? 'ui-btn--line' : 'ui-btn--ghost'}`}
                style={{ opacity: on ? 1 : 0.6 }}
              >
                <span className="ui-btn__label inline-flex items-center gap-2">
                  <span className="viz-swatch" style={{ background: viz(APPARATUS[key].slot) }} aria-hidden="true" />
                  {apparatusLabel(key)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    )}
  </div>
);

StatsFilters.propTypes = {
  meets: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string, date: PropTypes.string })).isRequired,
  meet: PropTypes.string.isRequired,
  onMeet: PropTypes.func.isRequired,
  apparatus: PropTypes.arrayOf(PropTypes.string),
  selected: PropTypes.instanceOf(Set),
  onToggleApparatus: PropTypes.func,
  teams: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string })),
  team: PropTypes.string,
  onTeam: PropTypes.func,
  allLabel: PropTypes.string,
};

export default StatsFilters;
