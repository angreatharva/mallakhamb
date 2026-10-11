import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { useResponsive } from '@/hooks/useResponsive';


/**
 * A listbox dropdown (the picker trigger and popover in components/ui/popover.css).
 * Keeps its own keyboard handling; the e2e flows find it by
 * `button[aria-haspopup="listbox"]` and its "Selected: …" name.
 */
const Dropdown = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  searchable = false,
  onSearch = null,
  loading = false,
  disabled = false,
  className = '',
  dropdownClassName = '',
  error = false,
  label = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const { isMobile } = useResponsive();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchable && onSearch && searchTerm.length >= 2) onSearch(searchTerm);
  }, [searchTerm, searchable, onSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { setIsOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
    buttonRef.current?.focus();
  };

  const filteredOptions = searchable
    ? options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <span className="block mb-2 type-tag text-fg-muted">{label}</span>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`ui-picker ui-picker--field ${value ? '' : 'ui-picker--empty'} ${error ? 'ui-picker--error' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={value ? `Selected: ${value.label}` : placeholder}
        aria-disabled={disabled}
      >
        {/* The placeholder here is the button's visible NAME ("Select
            competition first"), not a field hint, so it reads at 4.5:1. */}
        <span className="ui-picker__value">{value ? value.label : placeholder}</span>
        <ChevronDown className="ui-picker__chevron" aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div className={`ui-popover ui-popover--fill ui-fade-in ${dropdownClassName}`} role="listbox">
          {searchable && (
            <div className="ui-popover__search">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted pointer-events-none z-10" aria-hidden="true" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..." aria-label="Search options"
                  className="ui-input pl-8 pr-10"
                  autoFocus={!isMobile}
                  onClick={(e) => e.stopPropagation()}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
                    className="ui-popover__clear"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="ui-popover__list">
            {loading ? (
              <p className="ui-popover__empty type-body-s flex items-center justify-center gap-2">
                <span className="ui-spinner" aria-hidden="true" />
                Loading...
              </p>
            ) : filteredOptions.length === 0 ? (
              <p className="ui-popover__empty type-body-s">No options found</p>
            ) : (
              filteredOptions.map((option, i) => {
                const isSelected = value?.value === option.value;
                return (
                  <button
                    key={i}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option)}
                    className="ui-popover__option items-center"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(option); }
                      else if (e.key === 'ArrowDown') { e.preventDefault(); e.target.nextElementSibling?.focus(); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); e.target.previousElementSibling?.focus(); }
                    }}
                  >
                    <span className="flex-1 break-words type-body-s">{option.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-accent-fg" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
