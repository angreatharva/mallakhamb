import React, { forwardRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useTheme } from '../theme/useTheme';
import { MIN_TOUCH_TARGET } from '../../../styles/tokens';
import { useResponsive } from '../../../hooks/useResponsive';

/**
 * ThemedInput - A themed input component that adapts to the current role context
 *
 * Features:
 * - Auto-themed based on current role context
 * - Icon support (left side)
 * - Right element slot for password toggle, etc.
 * - Error state styling with accessible color contrast
 * - Focus indicators with 3:1 contrast ratio
 * - Minimum 44px touch target height
 * - Disabled and readonly states
 *
 * @param {Object} props
 * @param {React.ComponentType} [props.icon] - Icon component to display on the left
 * @param {boolean|string} [props.error] - Error state or error message
 * @param {React.ReactNode} [props.rightElement] - Element to display on the right (e.g., password toggle)
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.readOnly] - Readonly state
 * @param {object|string} [props.padding] - Responsive padding values (e.g., { mobile: 'sm', desktop: 'lg' } or 'md')
 * @param {object|string} [props.fontSize] - Responsive font size values
 *
 * @example
 * <ThemedInput
 *   icon={Mail}
 *   type="email"
 *   placeholder="Enter email"
 *   error={errors.email}
 * />
 *
 * @example
 * <ThemedInput
 *   type="password"
 *   placeholder="Enter password"
 *   rightElement={<button onClick={toggleVisibility}>👁️</button>}
 *   padding={{ mobile: 'sm', desktop: 'md' }}
 * />
 *
 * **Validates: Requirements 3.1, 3.5, 3.6, 3.7, 3.8, 3.9, 15.1, 15.5**
 */
export const ThemedInput = forwardRef(
  (
    { icon: Icon, error, rightElement, className, disabled, readOnly, padding, fontSize, ...props },
    ref
  ) => {
    const theme = useTheme();
    const { getResponsiveValue, isMobile } = useResponsive();

    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : '';

    // Get responsive padding value - memoize to prevent infinite loops
    const responsivePadding = useMemo(
      () => (padding ? getResponsiveValue(padding) : 'md'),
      [padding, getResponsiveValue]
    );

    const paddingMap = {
      sm: 'px-3 py-2',
      md: 'px-4 py-3',
      lg: 'px-5 py-4',
    };
    const paddingClass = paddingMap[responsivePadding] || paddingMap.md;

    // Get responsive font size value - memoize to prevent infinite loops
    const responsiveFontSize = useMemo(
      () => (fontSize ? getResponsiveValue(fontSize) : 'base'),
      [fontSize, getResponsiveValue]
    );

    const fontSizeMap = {
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
    };
    const fontSizeClass = fontSizeMap[responsiveFontSize] || fontSizeMap.base;

    // Memoize the whileFocus animation to prevent infinite loops
    const whileFocusAnimation = useMemo(
      () => ({
        boxShadow: hasError
          ? '0 0 0 3px rgba(239, 68, 68, 0.15)'
          : `0 0 0 3px ${theme.colors.primaryLight}`,
      }),
      [hasError, theme.colors.primaryLight]
    );

    return (
      <div className="w-full">
        <div className="relative">
          {/* Icon on the left */}
          {Icon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            >
              <Icon
                className="w-5 h-5"
                style={{
                  color: hasError ? '#EF4444' : 'rgba(255, 255, 255, 0.45)',
                }}
              />
            </div>
          )}

          {/* Input field */}
          <motion.input
            ref={ref}
            disabled={disabled}
            readOnly={readOnly}
            className={clsx(
              // Base styles
              'w-full rounded-lg',
              'bg-white/5 backdrop-blur-sm',
              'text-white placeholder:text-white/45',
              'border transition-all duration-200',
              'outline-none',

              // Responsive padding and font size
              paddingClass,
              fontSizeClass,

              // Minimum touch target (44px)
              'min-h-[44px]',

              // Icon padding
              Icon && 'pl-11',
              rightElement && 'pr-11',

              // Normal state
              !hasError &&
                !disabled &&
                !readOnly && ['border-white/10', 'hover:border-white/20', 'focus:border-current'],

              // Error state with accessible color contrast
              hasError && ['border-red-500/50', 'focus:border-red-500'],

              // Disabled state
              disabled && ['opacity-50', 'cursor-not-allowed', 'border-white/5'],

              // Readonly state
              readOnly && ['cursor-default', 'border-white/5'],

              className
            )}
            style={{
              // Role-specific focus color with 3:1 contrast ratio
              color: theme.colors.primary,
            }}
            whileFocus={whileFocusAnimation}
            {...props}
          />

          {/* Right element slot */}
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-sm text-red-400"
            role="alert"
            aria-live="polite"
          >
            {errorMessage}
          </motion.p>
        )}
      </div>
    );
  }
);

ThemedInput.displayName = 'ThemedInput';

ThemedInput.propTypes = {
  icon: PropTypes.elementType,
  error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  rightElement: PropTypes.node,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  padding: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
  fontSize: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
};

ThemedInput.defaultProps = {
  icon: null,
  error: false,
  rightElement: null,
  className: '',
  disabled: false,
  readOnly: false,
  padding: null,
  fontSize: null,
};

export default ThemedInput;
