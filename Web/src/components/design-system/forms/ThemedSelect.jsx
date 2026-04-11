import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '../theme/useTheme';
import { MIN_TOUCH_TARGET } from '../../../styles/tokens';

/**
 * ThemedSelect - A themed select component that adapts to the current role context
 *
 * Features:
 * - Consistent theming with ThemedInput
 * - Disabled and readonly states
 * - Minimum 44px touch target height
 * - Custom chevron icon
 *
 * @param {Object} props
 * @param {Array<{value: string, label: string}>} [props.options] - Select options
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.readOnly] - Readonly state
 *
 * @example
 * <ThemedSelect
 *   options={[
 *     { value: 'option1', label: 'Option 1' },
 *     { value: 'option2', label: 'Option 2' }
 *   ]}
 *   placeholder="Select an option"
 * />
 *
 * **Validates: Requirements 3.2, 3.8, 3.9**
 */
export const ThemedSelect = forwardRef(
  ({ options, placeholder, className, disabled, readOnly, children, ...props }, ref) => {
    const theme = useTheme();

    return (
      <div className="relative w-full">
        {/* Select element */}
        <motion.select
          ref={ref}
          disabled={disabled || readOnly}
          className={clsx(
            // Base styles
            'w-full px-4 py-3 pr-10 rounded-lg',
            'bg-white/5 backdrop-blur-sm',
            'text-white',
            'border transition-all duration-200',
            'outline-none appearance-none',
            'cursor-pointer',

            // Minimum touch target (44px)
            'min-h-[44px]',

            // Normal state
            !disabled &&
              !readOnly && ['border-white/10', 'hover:border-white/20', 'focus:border-current'],

            // Disabled state
            disabled && ['opacity-50', 'cursor-not-allowed', 'border-white/5'],

            // Readonly state
            readOnly && ['cursor-default', 'border-white/5'],

            className
          )}
          style={{
            // Role-specific focus color
            color: theme.colors.primary,
          }}
          whileFocus={{
            boxShadow: `0 0 0 3px ${theme.colors.primaryLight}`,
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}

          {/* Render options if provided */}
          {options &&
            options.map((option) => (
              <option key={option.value} value={option.value} className="bg-gray-900 text-white">
                {option.label}
              </option>
            ))}

          {/* Allow custom children options */}
          {children}
        </motion.select>

        {/* Chevron icon */}
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        >
          <ChevronDown
            className="w-5 h-5"
            style={{
              color: disabled ? 'rgba(255, 255, 255, 0.30)' : 'rgba(255, 255, 255, 0.45)',
            }}
          />
        </div>
      </div>
    );
  }
);

ThemedSelect.displayName = 'ThemedSelect';

ThemedSelect.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  placeholder: PropTypes.string,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  children: PropTypes.node,
};

ThemedSelect.defaultProps = {
  options: null,
  placeholder: '',
  className: '',
  disabled: false,
  readOnly: false,
  children: null,
};

export default ThemedSelect;
