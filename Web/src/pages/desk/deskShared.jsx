import PropTypes from 'prop-types';
import { Check } from 'lucide-react';

export const AGE_LABEL = {
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14', Under16: 'Under 16',
  Under18: 'Under 18', Above16: 'Above 16', Above18: 'Above 18',
};
export const ageLabel = (group) => AGE_LABEL[group] || group || '—';

export const APPARATUS_LABEL = {
  'Pole Mallakhamb': 'Pole', 'Rope Mallakhamb': 'Rope', 'Hanging Mallakhamb': 'Hanging',
};

export const genderWord = (gender) => (gender === 'Male' ? 'Boys' : gender === 'Female' ? 'Girls' : '—');

/** Server error text, then a fallback. */
export const errorText = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback;

/** A tick box in the look's own style (the `ui-check` pattern the forms use). */
export const CheckBox = ({ id, checked, onChange, disabled = false, children }) => (
  <label className="ui-check" data-checked={checked || undefined} htmlFor={id}>
    <input id={id} type="checkbox" className="sr-only" checked={checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    <span className="ui-check__box" aria-hidden="true">{checked && <Check className="w-3 h-3" />}</span>
    <span className="type-body-s">{children}</span>
  </label>
);
CheckBox.propTypes = {
  id: PropTypes.string.isRequired, checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool, children: PropTypes.node,
};

/** Save a Blob as a file. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
