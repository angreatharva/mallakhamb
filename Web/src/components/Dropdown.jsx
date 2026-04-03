import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useResponsive } from '../hooks/useResponsive';
import { COLORS, useReducedMotion } from '../pages/Home';

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
  const reduced = useReducedMotion();

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

  const borderColor = error
    ? 'rgba(239,68,68,0.5)'
    : isOpen
    ? `${COLORS.saffron}60`
    : COLORS.darkBorderSubtle;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-xs font-semibold tracking-wide mb-1.5"
          style={{ color: COLORS.saffronLight }}>
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 min-h-[44px] flex items-center justify-between gap-2 focus:outline-none focus:ring-2"
        style={{
          background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${borderColor}`,
          color: value ? '#fff' : 'rgba(255,255,255,0.45)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen ? `0 0 0 3px ${COLORS.saffron}18` : 'none',
          outlineColor: COLORS.saffron,
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={value ? `Selected: ${value.label}` : placeholder}
        aria-disabled={disabled}
      >
        <span className="truncate">{value ? value.label : placeholder}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="w-4 h-4" style={{ color: isOpen ? COLORS.saffron : 'rgba(255,255,255,0.45)' }} aria-hidden="true" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            className={`absolute left-0 right-0 mt-2 rounded-xl border overflow-hidden z-50 ${dropdownClassName}`}
            style={{
              background: '#111111',
              borderColor: `${COLORS.saffron}25`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${COLORS.saffron}10`,
              maxHeight: 280,
              overflowY: 'auto',
            }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="listbox"
          >
            {searchable && (
              <div className="p-2 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-8 py-2 text-sm rounded-lg focus:outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${COLORS.darkBorderSubtle}`,
                      color: '#fff',
                    }}
                    autoFocus={!isMobile}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {searchTerm && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="py-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-white/40 text-sm">
                  <motion.div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  Loading...
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-white/35 text-sm">No options found</div>
              ) : (
                filteredOptions.map((option, i) => {
                  const isSelected = value?.value === option.value;
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option)}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors duration-150 min-h-[44px]"
                      style={{
                        color: isSelected ? COLORS.saffronLight : 'rgba(255,255,255,0.75)',
                        background: isSelected ? `${COLORS.saffron}12` : 'transparent',
                      }}
                      whileHover={{ background: `${COLORS.saffron}0A`, color: '#fff' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(option); }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); e.target.nextElementSibling?.focus(); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); e.target.previousElementSibling?.focus(); }
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />}
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;
