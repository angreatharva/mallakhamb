/**
 * ResponsiveFilters Component
 * 
 * Responsive filter and search interfaces that adapt to mobile layouts.
 * Provides collapsible filters on mobile and expanded filters on desktop.
 * 
 * Requirements: 8.1, 10.1
 */

import { useState } from 'react';
import { Filter, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import Dropdown from '../Dropdown';

/**
 * Main responsive filters component
 */
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

  // Mobile layout with collapsible filters
  if (isMobile) {
    return (
      <ResponsiveContainer className={`mobile-filters ${className}`} {...props}>
        <div className="space-y-4">
          {/* Search Bar */}
          {showSearchBar && (
            <div className="relative">
              <div className="absolute inset-y-0 left-0 w-10 flex items-center justify-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-base bg-white text-gray-900 h-12"
              />
              {searchTerm && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          )}

          {/* Collapsible Filters */}
          {filters.length > 0 && (
            <div className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <div className="flex items-center space-x-2">
                  <Filter className="h-5 w-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Filters</span>
                  {filters.some(f => f.value) && (
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                      {filters.filter(f => f.value).length}
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                )}
              </button>
              
              {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-200">
                  {filters.map((filter, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {filter.label}
                        {filter.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <Dropdown
                        options={filter.options}
                        value={filter.value}
                        onChange={(value) => onFilterChange(filter.key, value)}
                        placeholder={filter.placeholder}
                        disabled={filter.disabled}
                      />
                      {filter.helpText && (
                        <p className="text-xs text-gray-500 mt-1">{filter.helpText}</p>
                      )}
                    </div>
                  ))}
                  
                  {showClearButton && filters.some(f => f.value) && (
                    <button
                      onClick={onClearFilters}
                      className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ResponsiveContainer>
    );
  }

  // Desktop layout with expanded filters
  return (
    <ResponsiveContainer className={`desktop-filters ${className}`} {...props}>
      <div className="space-y-4">
        {/* Search and Filters Row */}
        <div className={`grid gap-4 ${!showSearchBar ? (filters.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2') : (filters.length === 2 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-4')}`}>
          {/* Search */}
          {showSearchBar && (
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center justify-center z-10"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter Dropdowns */}
          {filters.map((filter, index) => (
            <div key={index} className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {filter.label}
                {filter.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <Dropdown
                options={filter.options}
                value={filter.value}
                onChange={(value) => onFilterChange(filter.key, value)}
                placeholder={filter.placeholder}
                disabled={filter.disabled}
              />
              {filter.helpText && (
                <p className="text-xs text-gray-500 mt-1">{filter.helpText}</p>
              )}
            </div>
          ))}
        </div>

        {/* Clear Filters Button */}
        {showClearButton && (filters.some(f => f.value) || searchTerm) && (
          <div className="flex justify-end mt-2.5">
            <button
              onClick={onClearFilters}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
};

/**
 * Specialized filters for team management
 */
export const ResponsiveTeamFilters = ({
  selectedGender,
  onGenderChange,
  selectedAgeGroup,
  onAgeGroupChange,
  searchTerm,
  onSearchChange,
  onClearFilters,
  ageGroups, // Accept filtered age groups as prop
  className = '',
  ...props
}) => {
  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  // Fallback age groups if not provided
  const defaultBoysAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const defaultGirlsAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    // Use provided age groups if available, otherwise fallback to defaults
    if (ageGroups && ageGroups.length > 0) {
      return ageGroups;
    }
    return selectedGender.value === 'Male' ? defaultBoysAgeGroups : defaultGirlsAgeGroups;
  };

  const filters = [
    {
      key: 'gender',
      label: 'Gender',
      required: true,
      options: genders,
      value: selectedGender,
      placeholder: 'Select gender first',
      helpText: null
    },
    {
      key: 'ageGroup',
      label: 'Age Group',
      required: true,
      options: getAvailableAgeGroups(),
      value: selectedAgeGroup,
      placeholder: selectedGender ? 'Select age group' : 'Select gender first',
      disabled: !selectedGender,
      helpText: selectedGender ? 
        `Available: ${getAvailableAgeGroups().map(ag => ag.label).join(', ')}` : 
        'Please select gender first to see available age groups'
    }
  ];

  const handleFilterChange = (key, value) => {
    if (key === 'gender') {
      onGenderChange(value);
    } else if (key === 'ageGroup') {
      onAgeGroupChange(value);
    }
  };

  return (
    <ResponsiveFilters
      searchTerm=""
      onSearchChange={() => {}}
      filters={filters}
      onFilterChange={handleFilterChange}
      onClearFilters={onClearFilters}
      searchPlaceholder="Search teams by name or coach..."
      className={`team-filters ${className}`}
      showSearchBar={false}
      {...props}
    />
  );
};

/**
 * Specialized filters for scoring and rankings
 */
export const ResponsiveScoreFilters = ({
  scoreType,
  onScoreTypeChange,
  selectedGender,
  onGenderChange,
  selectedAgeGroup,
  onAgeGroupChange,
  searchTerm,
  onSearchChange,
  onClearFilters,
  ageGroups, // Accept filtered age groups as prop
  className = '',
  ...props
}) => {
  const scoreTypes = [
    { value: 'add', label: 'Add Score' },
    { value: 'individual', label: 'Individual Rankings' },
    { value: 'rankings', label: 'Team Rankings' }
  ];

  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  // Fallback age groups if not provided
  const defaultBoysAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const defaultGirlsAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    // Use provided age groups if available, otherwise fallback to defaults
    if (ageGroups && ageGroups.length > 0) {
      return ageGroups;
    }
    return selectedGender.value === 'Male' ? defaultBoysAgeGroups : defaultGirlsAgeGroups;
  };

  const getSearchPlaceholder = () => {
    switch (scoreType) {
      case 'add':
        return 'Search teams by name or coach...';
      case 'individual':
        return 'Search players by name or team...';
      case 'rankings':
        return 'Search teams by name...';
      default:
        return 'Search...';
    }
  };

  const filters = [
    {
      key: 'scoreType',
      label: 'Score Type',
      required: false,
      options: scoreTypes,
      value: scoreTypes.find(s => s.value === scoreType),
      placeholder: 'Select score type',
      helpText: null
    },
    {
      key: 'gender',
      label: 'Gender Filter',
      required: true,
      options: genders,
      value: selectedGender,
      placeholder: 'Select gender first',
      helpText: null
    },
    {
      key: 'ageGroup',
      label: 'Age Group Filter',
      required: false,
      options: getAvailableAgeGroups(),
      value: selectedAgeGroup,
      placeholder: selectedGender ? 'Select age group' : 'Select gender first',
      disabled: !selectedGender,
      helpText: selectedGender ? 
        `Available: ${getAvailableAgeGroups().map(ag => ag.label).join(', ')}` : 
        'Please select gender first to see available age groups'
    }
  ];

  const handleFilterChange = (key, value) => {
    if (key === 'scoreType') {
      onScoreTypeChange(value.value);
    } else if (key === 'gender') {
      onGenderChange(value);
    } else if (key === 'ageGroup') {
      onAgeGroupChange(value);
    }
  };

  return (
    <ResponsiveFilters
      searchTerm=""
      onSearchChange={() => {}}
      filters={filters}
      onFilterChange={handleFilterChange}
      onClearFilters={onClearFilters}
      searchPlaceholder={getSearchPlaceholder()}
      className={`score-filters ${className}`}
      showSearchBar={false}
      {...props}
    />
  );
};

export default ResponsiveFilters;