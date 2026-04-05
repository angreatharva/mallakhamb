import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useTheme } from '../theme/useTheme';

/**
 * ThemedTextarea - A themed textarea component that adapts to the current role context
 * 
 * Features:
 * - Consistent theming with ThemedInput
 * - Disabled and readonly states
 * - Auto-resizing support
 * - Error state styling
 * 
 * @param {Object} props
 * @param {boolean|string} [props.error] - Error state or error message
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.disabled] - Disabled state
 * @param {boolean} [props.readOnly] - Readonly state
 * @param {number} [props.rows] - Number of visible text rows
 * 
 * @example
 * <ThemedTextarea 
 *   placeholder="Enter description"
 *   rows={4}
 *   error={errors.description}
 * />
 * 
 * **Validates: Requirements 3.3, 3.9**
 */
export const ThemedTextarea = forwardRef(({
  error,
  className,
  disabled,
  readOnly,
  rows = 4,
  ...props
}, ref) => {
  const theme = useTheme();
  
  const hasError = Boolean(error);
  const errorMessage = typeof error === 'string' ? error : '';
  
  return (
    <div className="w-full">
      {/* Textarea element */}
      <motion.textarea
        ref={ref}
        disabled={disabled}
        readOnly={readOnly}
        rows={rows}
        className={clsx(
          // Base styles
          'w-full px-4 py-3 rounded-lg',
          'bg-white/5 backdrop-blur-sm',
          'text-white placeholder:text-white/45',
          'border transition-all duration-200',
          'outline-none resize-y',
          
          // Normal state
          !hasError && !disabled && !readOnly && [
            'border-white/10',
            'hover:border-white/20',
            'focus:border-current',
          ],
          
          // Error state with accessible color contrast
          hasError && [
            'border-red-500/50',
            'focus:border-red-500',
          ],
          
          // Disabled state
          disabled && [
            'opacity-50',
            'cursor-not-allowed',
            'border-white/5',
            'resize-none',
          ],
          
          // Readonly state
          readOnly && [
            'cursor-default',
            'border-white/5',
            'resize-none',
          ],
          
          className
        )}
        style={{
          // Role-specific focus color
          color: theme.colors.primary,
        }}
        whileFocus={{
          boxShadow: hasError 
            ? '0 0 0 3px rgba(239, 68, 68, 0.15)'
            : `0 0 0 3px ${theme.colors.primaryLight}`,
        }}
        {...props}
      />
      
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
});

ThemedTextarea.displayName = 'ThemedTextarea';

ThemedTextarea.propTypes = {
  error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  className: PropTypes.string,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
  rows: PropTypes.number,
};

ThemedTextarea.defaultProps = {
  error: false,
  className: '',
  disabled: false,
  readOnly: false,
  rows: 4,
};

export default ThemedTextarea;
