import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useResponsive } from '../hooks/useResponsive';

const Dropdown = ({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select an option",
  searchable = false,
  onSearch = null,
  loading = false,
  disabled = false,
  className = '',
  dropdownClassName = '',
  error = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const { isMobile, isTablet } = useResponsive();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchable && onSearch && searchTerm.length >= 2) {
      onSearch(searchTerm);
    }
  }, [searchTerm, searchable, onSearch]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          // Focus first option or search input
          const firstOption = dropdownRef.current?.querySelector('[role="option"]');
          const searchInput = dropdownRef.current?.querySelector('input[type="text"]');
          (searchInput || firstOption)?.focus();
          break;
        case 'ArrowUp':
          event.preventDefault();
          // Focus last option
          const options = dropdownRef.current?.querySelectorAll('[role="option"]');
          options?.[options.length - 1]?.focus();
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
    buttonRef.current?.focus();
  };

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const filteredOptions = searchable 
    ? options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Mobile-first button classes with proper touch targets
  const buttonClasses = [
    'w-full text-left border border-gray-300 rounded-md shadow-sm',
    'focus:outline-none focus:ring-2 focus:border-transparent',
    // Mobile-optimized padding for touch targets (min 44px height)
    'px-3 py-3 md:py-2',
    // Text size optimization for mobile
    'text-base md:text-sm',
    // Minimum touch target height
    'min-h-[44px]',
    // Error state styling
    error ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500',
    // Disabled state
    disabled 
      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
      : 'bg-white hover:bg-gray-50 text-gray-900',
    className
  ].join(' ');

  // Responsive dropdown positioning
  const getDropdownClasses = () => {
    const baseClasses = [
      'absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg',
      'max-h-60 overflow-auto',
      dropdownClassName
    ];

    if (isMobile) {
      // On mobile, use full viewport width if needed and better positioning
      baseClasses.push('mobile-dropdown');
    }

    return baseClasses.join(' ');
  };

  // Mobile-optimized option classes
  const getOptionClasses = (isSelected = false) => {
    return [
      'w-full px-3 py-3 md:py-2 text-left text-base md:text-sm',
      'hover:bg-gray-100 focus:outline-none focus:bg-gray-100',
      'min-h-[44px] md:min-h-[36px] flex items-center',
      'transition-colors duration-150',
      isSelected ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
    ].join(' ');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={buttonClasses}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={value ? `Selected: ${value.label}` : placeholder}
      >
        <span className="block truncate pr-8">
          {value ? value.label : placeholder}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <ChevronDown 
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'transform rotate-180' : ''
            }`} 
          />
        </span>
      </button>

      {isOpen && !disabled && (
        <div className={getDropdownClasses()} role="listbox">
          {searchable && (
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-2 md:py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 text-base md:text-sm min-h-[44px] md:min-h-[32px]"
                autoFocus={!isMobile} // Don't auto-focus on mobile to prevent keyboard popup
              />
            </div>
          )}
          
          {loading ? (
            <div className="p-3 text-center text-gray-500 min-h-[44px] flex items-center justify-center">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span>Loading...</span>
              </div>
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-gray-500 min-h-[44px] flex items-center justify-center">
              No options found
            </div>
          ) : (
            <div className="py-1">
              {filteredOptions.map((option, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={value?.value === option.value}
                  onClick={() => handleSelect(option)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(option);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nextOption = e.target.nextElementSibling;
                      nextOption?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prevOption = e.target.previousElementSibling;
                      if (prevOption) {
                        prevOption.focus();
                      } else if (searchable) {
                        // Focus search input if at first option
                        const searchInput = dropdownRef.current?.querySelector('input[type="text"]');
                        searchInput?.focus();
                      }
                    }
                  }}
                  className={getOptionClasses(value?.value === option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {value?.value === option.value && (
                    <span className="ml-auto text-blue-600">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
