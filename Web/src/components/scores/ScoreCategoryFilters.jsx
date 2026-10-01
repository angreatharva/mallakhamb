import Dropdown from '@/components/auth/Dropdown';
import { FG } from '@/styles/tokens';

/**
 * The category picker above the results board.
 *
 * Every dropdown is mounted at all times. They used to appear one at a time —
 * `ResponsiveScoreFilters` only pushed Apparatus into its filter list once
 * Competition Type had been chosen — so the form grew as you filled it in and
 * you could not see what was still to come. All five are rendered from the
 * first paint; a control whose options depend on an earlier choice stays
 * disabled and says which choice unlocks it, rather than vanishing.
 *
 * Apparatus is the LAST selection, and the pages fetch only once it is set.
 */

const GENDERS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

const FilterLabel = ({ children, primary = false }) => (
  <label className="block text-xs font-bold tracking-widest uppercase mb-2"
    style={{ color: primary ? FG.brand : 'var(--fg-muted)' }}>
    {children}
  </label>
);

const ScoreCategoryFilters = ({
  competitionOptions = [],
  selectedCompetition,
  onCompetitionChange,
  loadingCompetitions = false,
  // A plain admin does not choose a competition — theirs comes from the route
  // context — but the control is still rendered, fixed and disabled, so all
  // three pages present the same five filters in the same order.
  competitionLocked = false,

  selectedGender,
  onGenderChange,

  ageGroupOptions = [],
  selectedAgeGroup,
  onAgeGroupChange,

  competitionTypeOptions = [],
  selectedCompetitionType,
  onCompetitionTypeChange,

  apparatusOptions = [],
  selectedApparatus,
  onApparatusChange,

  onClearFilters,

  // Team Championship is one category (competition, gender, age group); the
  // competition type is fixed and every apparatus counts, so those two go.
  categoryOnly = false,
}) => {
  const competitionChosen = Boolean(selectedCompetition);

  return (
    <div className="space-y-4">
      <div>
        <FilterLabel primary>Competition *</FilterLabel>
        <Dropdown
          options={competitionOptions}
          value={selectedCompetition}
          onChange={onCompetitionChange}
          placeholder={loadingCompetitions ? 'Loading competitions...' : 'Select competition...'}
          className="w-full"
          loading={loadingCompetitions}
          disabled={loadingCompetitions || competitionLocked}
        />
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${categoryOnly ? '' : 'lg:grid-cols-4'} gap-4`}>
        <div>
          <FilterLabel>Gender *</FilterLabel>
          <Dropdown
            options={GENDERS}
            value={selectedGender}
            onChange={onGenderChange}
            placeholder={competitionChosen ? 'Select gender...' : 'Select competition first'}
            className="w-full"
            disabled={!competitionChosen}
          />
        </div>

        <div>
          <FilterLabel>Age Group *</FilterLabel>
          <Dropdown
            options={ageGroupOptions}
            value={selectedAgeGroup}
            onChange={onAgeGroupChange}
            placeholder={selectedGender ? 'Select age group...' : 'Select gender first'}
            className="w-full"
            disabled={!selectedGender}
          />
        </div>

        {!categoryOnly && (<>
        <div>
          <FilterLabel>Competition Type *</FilterLabel>
          <Dropdown
            options={competitionTypeOptions}
            value={selectedCompetitionType}
            onChange={onCompetitionTypeChange}
            placeholder={selectedAgeGroup ? 'Select type...' : 'Select age group first'}
            className="w-full"
            disabled={!selectedAgeGroup}
          />
        </div>

        <div>
          <FilterLabel>Apparatus *</FilterLabel>
          <Dropdown
            options={apparatusOptions}
            value={selectedApparatus}
            onChange={onApparatusChange}
            placeholder={selectedCompetitionType ? 'Select apparatus...' : 'Select type first'}
            className="w-full"
            disabled={!selectedCompetitionType}
          />
        </div>
        </>)}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onClearFilters}
          className="px-4 py-2 rounded-xl border text-xs font-bold transition-all duration-200 tap-safe mouse:min-h-[36px] hover:bg-white/5"
          style={{ borderColor: 'rgb(var(--ink) / 0.12)', color: 'var(--fg-muted)' }}>
          Clear Filters
        </button>
      </div>
    </div>
  );
};

export default ScoreCategoryFilters;
