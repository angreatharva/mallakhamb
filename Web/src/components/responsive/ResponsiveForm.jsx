/**
 * ResponsiveForm Component
 * 
 * A responsive form component optimized for mobile interaction with proper
 * touch targets, vertical stacking, and validation display.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 10.2
 */

import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ResponsiveFormContainer } from './ResponsiveContainer';

/**
 * Responsive form wrapper with mobile-optimized layout
 */
export const ResponsiveForm = ({ 
  children, 
  onSubmit, 
  className = '',
  spacing = 'responsive',
  ...props 
}) => {
  const { isMobile, isTablet } = useResponsive();
  
  // Mobile-first spacing classes
  const getSpacingClasses = () => {
    if (spacing === 'responsive') {
      return 'space-y-4 md:space-y-6';
    }
    return spacing;
  };

  return (
    <ResponsiveFormContainer>
      <form 
        onSubmit={onSubmit}
        className={`${getSpacingClasses()} ${className}`}
        {...props}
      >
        {children}
      </form>
    </ResponsiveFormContainer>
  );
};

/**
 * Responsive form field with mobile-optimized layout
 */
export const ResponsiveFormField = ({ 
  label, 
  children, 
  error, 
  required = false,
  className = '',
  labelClassName = '',
  errorClassName = ''
}) => {
  const { isMobile } = useResponsive();
  
  return (
    <div className={`responsive-form-field ${className}`}>
      {label && (
        <label className={`block text-sm font-medium text-gray-700 mb-1 ${labelClassName}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className={`mt-2 text-sm text-red-600 ${errorClassName}`}>
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * Responsive input with mobile-optimized touch targets
 */
export const ResponsiveInput = React.forwardRef(({ 
  type = 'text',
  className = '',
  error = false,
  ...props 
}, ref) => {
  const { isMobile } = useResponsive();
  
  // Mobile-first input classes with proper touch targets
  const inputClasses = [
    'block w-full border border-gray-300 rounded-md shadow-sm bg-white text-gray-900',
    'focus:outline-none focus:ring-2 focus:border-transparent',
    // Mobile-optimized padding for touch targets (min 44px height)
    'px-3 py-3 md:py-2',
    // Text size optimization for mobile
    'text-base md:text-sm',
    // Error state styling
    error ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500',
    className
  ].join(' ');

  return (
    <input
      ref={ref}
      type={type}
      className={inputClasses}
      {...props}
    />
  );
});

ResponsiveInput.displayName = 'ResponsiveInput';

/**
 * Responsive select with mobile-optimized touch targets
 */
export const ResponsiveSelect = React.forwardRef(({ 
  children,
  className = '',
  error = false,
  ...props 
}, ref) => {
  const { isMobile } = useResponsive();
  
  const selectClasses = [
    'block w-full border border-gray-300 rounded-md shadow-sm bg-white text-gray-900',
    'focus:outline-none focus:ring-2 focus:border-transparent',
    // Mobile-optimized padding for touch targets
    'px-3 py-3 md:py-2',
    // Text size optimization for mobile
    'text-base md:text-sm',
    // Error state styling
    error ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500',
    className
  ].join(' ');

  return (
    <select
      ref={ref}
      className={selectClasses}
      {...props}
    >
      {children}
    </select>
  );
});

ResponsiveSelect.displayName = 'ResponsiveSelect';

/**
 * Responsive button with mobile-optimized touch targets
 */
export const ResponsiveButton = ({ 
  children,
  variant = 'primary',
  size = 'responsive',
  disabled = false,
  loading = false,
  className = '',
  ...props 
}) => {
  const { isMobile } = useResponsive();
  
  // Base button classes with mobile-first approach
  const baseClasses = [
    'inline-flex items-center justify-center border border-transparent rounded-md',
    'font-medium focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'transition-colors duration-200'
  ];
  
  // Size classes with mobile-optimized touch targets
  const sizeClasses = {
    responsive: 'px-4 py-3 md:py-2 text-base md:text-sm min-h-[44px]',
    small: 'px-3 py-2 text-sm min-h-[44px] md:min-h-[36px]',
    large: 'px-6 py-4 text-lg min-h-[48px]'
  };
  
  // Variant classes
  const variantClasses = {
    primary: 'text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 focus:ring-blue-500',
    success: 'text-white bg-green-600 hover:bg-green-700 focus:ring-green-500',
    danger: 'text-white bg-red-600 hover:bg-red-700 focus:ring-red-500'
  };
  
  const buttonClasses = [
    ...baseClasses,
    sizeClasses[size] || sizeClasses.responsive,
    variantClasses[variant] || variantClasses.primary,
    className
  ].join(' ');

  return (
    <button
      className={buttonClasses}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
};

/**
 * Responsive password input with show/hide toggle
 */
export const ResponsivePasswordInput = React.forwardRef(({ 
  showPassword,
  onTogglePassword,
  className = '',
  error = false,
  ...props 
}, ref) => {
  const { isMobile } = useResponsive();
  
  return (
    <div className="relative">
      <ResponsiveInput
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        className={`pr-12 ${className}`}
        error={error}
        {...props}
      />
      <button
        type="button"
        onClick={onTogglePassword}
        className="absolute inset-y-0 right-0 pr-3 flex items-center min-h-[44px] min-w-[44px] justify-center"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? (
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
});

ResponsivePasswordInput.displayName = 'ResponsivePasswordInput';

/**
 * Responsive form grid for multi-column layouts on larger screens
 */
export const ResponsiveFormGrid = ({ 
  children, 
  columns = { mobile: 1, tablet: 2, desktop: 2 },
  className = '' 
}) => {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  // Mobile-first grid classes
  const gridClasses = [
    'grid gap-4 md:gap-6',
    `grid-cols-${columns.mobile}`,
    `md:grid-cols-${columns.tablet}`,
    `lg:grid-cols-${columns.desktop}`,
    className
  ].join(' ');
  
  return (
    <div className={gridClasses}>
      {children}
    </div>
  );
};

export default ResponsiveForm;