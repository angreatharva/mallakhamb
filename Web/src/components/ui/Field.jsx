import { Children, cloneElement, forwardRef, isValidElement, useId, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import '@/styles/look-fonts';
import { cx } from './cx';
import { IconButton } from './Button';

/**
 * A labelled field. Wires its one control to the label, the help text and the
 * error (ids, aria-describedby, aria-invalid), so a screen reader hears all
 * three. The control keeps every prop the caller gave it.
 *
 *   <Field label="Email" help="We send the reset code here" error={errors.email}>
 *     <Input type="email" autoComplete="email" {...register('email')} />
 *   </Field>
 */
export const Field = ({ label, help = null, error = null, required = false, id: idProp, className = '', children }) => {
  const auto = useId();
  const id = idProp || `f${auto.replace(/:/g, '')}`;
  const helpId = help ? `${id}-help` : null;
  const errorId = error ? `${id}-error` : null;
  const control = Children.only(children);
  return (
    <div className={cx('ui-field', className)}>
      <label htmlFor={id} className="ui-field__label type-tag">
        {label}
        {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
      </label>
      {isValidElement(control) && cloneElement(control, {
        id,
        required: required || control.props.required,
        'aria-invalid': error ? 'true' : control.props['aria-invalid'],
        'aria-describedby': [control.props['aria-describedby'], helpId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {help && <p id={helpId} className="ui-field__help type-caption">{help}</p>}
      {error && <p id={errorId} className="ui-field__error type-caption" role="alert">{error}</p>}
    </div>
  );
};
Field.propTypes = {
  label: PropTypes.node.isRequired,
  help: PropTypes.node,
  error: PropTypes.node,
  required: PropTypes.bool,
  id: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.element.isRequired,
};

/**
 * Inputs. Mark fields stay number-only TEXT inputs (`inputMode="decimal"`,
 * `numeric`) — never type="number", which changes the value on scroll.
 */
export const Input = forwardRef(function Input({ numeric = false, className = '', ...rest }, ref) {
  return <input ref={ref} className={cx('ui-input', numeric && 'ui-input--numeric', className)} {...rest} />;
});
Input.propTypes = { numeric: PropTypes.bool, className: PropTypes.string };

export const Textarea = forwardRef(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={cx('ui-input', className)} {...rest} />;
});
Textarea.propTypes = { className: PropTypes.string };

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <div className="ui-select">
      <select ref={ref} className={cx('ui-input', className)} {...rest}>{children}</select>
      <ChevronDown className="ui-select__chevron" aria-hidden="true" />
    </div>
  );
});
Select.propTypes = { className: PropTypes.string, children: PropTypes.node };

/** A password input with a show/hide toggle that says what it will do. */
export const PasswordInput = forwardRef(function PasswordInput({ className = '', ...rest }, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="ui-password">
      <input ref={ref} type={shown ? 'text' : 'password'} className={cx('ui-input', className)} {...rest} />
      <IconButton
        className="ui-password__toggle"
        variant="ghost"
        icon={shown ? EyeOff : Eye}
        label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      />
    </div>
  );
});
PasswordInput.propTypes = { className: PropTypes.string };
