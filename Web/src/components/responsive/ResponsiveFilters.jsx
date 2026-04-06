import { useState } from 'react';
import { Filter, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import Dropdown from '../Dropdown';
import { ADMIN_COLORS } from '../../styles/tokens';

const C = ADMIN_COLORS;
const surface    = C.darkCard;
const elevated   = C.darkElevated;
const border     = C.darkBorderSubtle;
const borderMid  = C.darkBorderMid;
const textPrimary   = 'rgba(255,255,255,0.90)';
const textSecondary = 'rgba(255,255,255,0.50)';
const textMuted     = 'rgba(255,255,255,0.30)';

// ─── Shared search input ──────────────────────────────────────────────────────
const SearchInput = ({ value, onChange, placeholder, height = 44 }) => (
  <div style={{ position: 'relative' }}>
    <Search style={{
      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
      width: 15, height: 15, color: textSecondary, pointerEvents: 'none',
    }} />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        height,
        paddingLeft: 36,
        paddingRight: value ? 36 : 14,
        background: elevated,
        border: `1px solid ${borderMid}`,
        borderRadius: 10,
        color: textPrimary,
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => { e.target.style.borderColor = `${C.saffron}70`; }}
      onBlur={e => { e.target.style.borderColor = borderMid; }}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: textSecondary, display: 'flex', alignItems: 'center',
        }}
        aria-label="Clear search"
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    )}
  </div>
);

// ─── Filter label ─────────────────────────────────────────────────────────────
const FilterLabel = ({ children, required }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: textSecondary, marginBottom: 6 }}>
    {children}
    {required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
  </label>
);

// ─── Clear button ─────────────────────────────────────────────────────────────
const ClearButton = ({ onClick, fullWidth = false }) => (
  <button
    onClick={onClick}
    style={{
      width: fullWidth ? '100%' : 'auto',
      padding: '9px 18px',
      background: 'rgba(255,255,255,0.06)',
      border: `1px solid ${borderMid}`,
      borderRadius: 10,
      color: textSecondary,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = textPrimary; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = textSecondary; }}
  >
    Clear Filters
  </button>
);

// ─── Active filter count badge ────────────────────────────────────────────────
const ActiveBadge = ({ count }) => count > 0 ? (
  <span style={{
    background: `${C.saffron}22`,
    color: C.saffronLight,
    border: `1px solid ${C.saffron}44`,
    borderRadius: 20,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 6,
  }}>
    {count}
  </span>
) : null;

// ─── ResponsiveFilters ────────────────────────────────────────────────────────
export const ResponsiveFilters = ({
  searchTerm = '',
  onSearchChange,
  filters = [],
  onFilterChange,
  onClearFilters,
  searchPlaceholder = 'Search...',
  className = '',
  showClearButton = true,
  showSearchBar = true,
  ...props
}) => {
  const { isMobile } = useResponsive();
  const [isExpanded, setIsExpanded] = useState(false);
  const activeCount = filters.filter(f => f.value).length;

  if (isMobile) {
    return (
      <ResponsiveContainer className={className} {...props}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showSearchBar && (
            <SearchInput value={searchTerm} onChange={onSearchChange} placeholder={searchPlaceholder} />
          )}

          {filters.length > 0 && (
            <div style={{ background: elevated, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: textPrimary,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Filter style={{ width: 15, height: 15, color: C.saffron }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Filters</span>
                  <ActiveBadge count={activeCount} />
                </div>
                {isExpanded
                  ? <ChevronUp style={{ width: 16, height: 16, color: textSecondary }} />
                  : <ChevronDown style={{ width: 16, height: 16, color: textSecondary }} />
                }
              </button>

              {isExpanded && (
                <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filters.map((filter, i) => (
                    <div key={i}>
                      <FilterLabel required={filter.required}>{filter.label}</FilterLabel>
                      <Dropdown
                        options={filter.options}
                        value={filter.value}
                        onChange={v => onFilterChange(filter.key, v)}
                        placeholder={filter.placeholder}
                        disabled={filter.disabled}
                      />
                      {filter.helpText && (
                        <p style={{ fontSize: 11, color: textMuted, marginTop: 5 }}>{filter.helpText}</p>
                      )}
                    </div>
                  ))}
                  {showClearButton && activeCount > 0 && (
                    <ClearButton onClick={onClearFilters} fullWidth />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop
  const totalCols = (showSearchBar ? 1 : 0) + filters.length;
  const gridCols = Math.min(totalCols, 4);

  return (
    <ResponsiveContainer className={className} {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 14 }}>
          {showSearchBar && (
            <div>
              <FilterLabel>Search</FilterLabel>
              <SearchInput value={searchTerm} onChange={onSearchChange} placeholder={searchPlaceholder} height={40} />
            </div>
          )}
          {filters.map((filter, i) => (
            <div key={i}>
              <FilterLabel required={filter.required}>{filter.label}</FilterLabel>
              <Dropdown
                options={filter.options}
                value={filter.value}
                onChange={v => onFilterChange(filter.key, v)}
                placeholder={filter.placeholder}
                disabled={filter.disabled}
              />
              {filter.helpText && (
                <p style={{ fontSize: 11, color: textMuted, marginTop: 5 }}>{filter.helpText}</p>
              )}
            </div>
          ))}
        </div>

        {showClearButton && (activeCount > 0 || searchTerm) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ClearButton onClick={onClearFilters} />
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

// ─── ResponsiveTeamFilters ────────────────────────────────────────────────────
export const ResponsiveTeamFilters = ({
  selectedGender,
  onGenderChange,
  selectedAgeGroup,
  onAgeGroupChange,
  searchTerm,
  onSearchChange,
  onClearFilters,
  ageGroups,
  className = '',
  ...props
}) => {
  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ];

  const defaultBoysAgeGroups = [
    { value: 'Under10', label: 'Under 10' }, { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' }, { value: 'Under18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' },
  ];
  const defaultGirlsAgeGroups = [
    { value: 'Under10', label: 'Under 10' }, { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' }, { value: 'Under16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' },
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    if (ageGroups?.length > 0) return ageGroups;
    return selectedGender.value === 'Male' ? defaultBoysAgeGroups : defaultGirlsAgeGroups;
  };

  const filters = [
    { key: 'gender', label: 'Gender', required: true, options: genders, value: selectedGender, placeholder: 'Select gender' },
    {
      key: 'ageGroup', label: 'Age Group', required: true,
      options: getAvailableAgeGroups(), value: selectedAgeGroup,
      placeholder: selectedGender ? 'Select age group' : 'Select gender first',
      disabled: !selectedGender,
      helpText: !selectedGender ? 'Select gender first' : null,
    },
  ];

  return (
    <ResponsiveFilters
      searchTerm="" onSearchChange={() => {}}
      filters={filters}
      onFilterChange={(key, value) => key === 'gender' ? onGenderChange(value) : onAgeGroupChange(value)}
      onClearFilters={onClearFilters}
      className={className}
      showSearchBar={false}
      {...props}
    />
  );
};

// ─── ResponsiveScoreFilters ───────────────────────────────────────────────────
export const ResponsiveScoreFilters = ({
  scoreType, onScoreTypeChange,
  selectedGender, onGenderChange,
  selectedAgeGroup, onAgeGroupChange,
  selectedCompetitionType, onCompetitionTypeChange,
  searchTerm, onSearchChange,
  onClearFilters,
  ageGroups,
  competitionTypes,
  className = '',
  ...props
}) => {
  const scoreTypes = [
    { value: 'add', label: 'Add Score' },
    { value: 'individual', label: 'Individual Rankings' },
    { value: 'rankings', label: 'Team Rankings' },
  ];
  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ];
  const defaultBoysAgeGroups = [
    { value: 'Under10', label: 'Under 10' }, { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' }, { value: 'Under18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' },
  ];
  const defaultGirlsAgeGroups = [
    { value: 'Under10', label: 'Under 10' }, { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' }, { value: 'Under16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' },
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    if (ageGroups?.length > 0) return ageGroups;
    return selectedGender.value === 'Male' ? defaultBoysAgeGroups : defaultGirlsAgeGroups;
  };

  const filters = [
    { key: 'scoreType', label: 'Score Type', options: scoreTypes, value: scoreTypes.find(s => s.value === scoreType), placeholder: 'Select type' },
    { key: 'gender', label: 'Gender', required: true, options: genders, value: selectedGender, placeholder: 'Select gender' },
    {
      key: 'ageGroup', label: 'Age Group', required: true,
      options: getAvailableAgeGroups(), value: selectedAgeGroup,
      placeholder: selectedGender ? 'Select age group' : 'Select gender first',
      disabled: !selectedGender,
      helpText: !selectedGender ? 'Select gender first' : null,
    },
    { key: 'competitionType', label: 'Competition Type', required: true, options: competitionTypes || [], value: selectedCompetitionType, placeholder: 'Select type' },
  ];

  const handleFilterChange = (key, value) => {
    if (key === 'scoreType') onScoreTypeChange(value.value);
    else if (key === 'gender') onGenderChange(value);
    else if (key === 'ageGroup') onAgeGroupChange(value);
    else if (key === 'competitionType') onCompetitionTypeChange(value);
  };

  return (
    <ResponsiveFilters
      searchTerm="" onSearchChange={() => {}}
      filters={filters}
      onFilterChange={handleFilterChange}
      onClearFilters={onClearFilters}
      className={className}
      showSearchBar={false}
      {...props}
    />
  );
};

export default ResponsiveFilters;
