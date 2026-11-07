import PropTypes from 'prop-types';
import Dropdown from '@/components/auth/Dropdown';

/**
 * A searchable stand-in for a native <Select> over a team or competition list:
 * plain string values in and out, so a screen swaps it in without reshaping its
 * state. Every team and competition picker carries a search (owner rule,
 * 2026-11-07); a native <select> cannot.
 */
const SearchSelect = ({ value, onChange, options, placeholder = 'Select…', label = '', disabled = false, className = '' }) => {
  const picked = options.find((o) => String(o.value) === String(value)) || null;
  return (
    <Dropdown
      searchable
      label={label}
      className={className}
      options={options}
      value={picked}
      onChange={(o) => onChange(o ? String(o.value) : '')}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
};

SearchSelect.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired,
  })).isRequired,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default SearchSelect;
