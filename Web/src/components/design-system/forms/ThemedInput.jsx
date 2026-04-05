import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useTheme } from '../theme/useTheme';
import { MIN_TOUCH_TARGET } from '../../../styles/tokens';

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
 * />
 * 
 * **Validates: Requirements 3.1, 3.5, 3.6, 3.7, 3.8, 3.9**
 */
export const ThemedInput = forwardRef(({
  icon: Icon,
  error,
  rightElement,
  className,
  disabled,
  readOnly,
  ...props
}, ref) => {
  const theme = useTheme();
  
  const hasError = Boolean(error);
  const errorMessage = typeof error === 'string' ? error : '';
  
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
                color: hasError 
                  ? '#EF4444' 
                  : 'rgba(255, 255, 255, 0.45)' 
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
            'w-full px-4 py-3 rounded-lg',
            'bg-white/5 backdrop-blur-sm',
            'text-white placeholder:text-white/45',
            'border transition-all duration-200',
            'outline-none',
            
            // Minimum touch target (44px)
            'min-h-[44px]',
            
            // Icon padding
            Icon && 'pl-11',
            rightElement && 'pr-11',
            
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
            ],
            
            // Readonly state
            readOnly && [
              'cursor-default',
              'border-white/5',
            ],
            
            className
          )}
          style={{
            // Role-specific focus color with 3:1 contrast ratio
            color: theme.colors.primary,
          }}
          whileFocus={{
            boxShadow: hasError 
              ? '0 0 0 3px rgba(239, 68, 68, 0.15)'
              : `0 0 0 3px ${theme.colors.primaryLight}`,
          }}
          {...props}
        />
        
        {/* Right element slot */}
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
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
});

ThemedInput.displayName = 'ThemedInput';

ThemedInput.propTypes = {
  icon: PropTypes.elementType,
  error: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  rightElement: PropTypes.node,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  readOnly: PropTypes.bool,
};

ThemedInput.defaultProps = {
  icon: null,
  error: false,
  rightElement: null,
  className: '',
  disabled: false,
  readOnly: false,
};

export default ThemedInput;
