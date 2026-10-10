import Dropdown from '@/components/auth/Dropdown';
import { Button } from '@/components/ui';

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
  <label className={`block mb-2 type-tag ${primary ? 'text-accent-fg' : 'text-fg-muted'}`}>
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
        <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear Filters</Button>
      </div>
    </div>
  );
};

export default ScoreCategoryFilters;
