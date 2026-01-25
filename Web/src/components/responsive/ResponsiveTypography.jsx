/**
 * Responsive Typography Components
 * 
 * Provides responsive typography components that automatically scale
 * based on viewport size while preserving desktop layouts.
 * 
 * Requirements: 5.1, 5.2, 5.4
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

/**
 * Responsive heading component that scales appropriately across viewports
 */
export const ResponsiveHeading = ({ 
  level = 1, 
  children, 
  className = '', 
  variant = 'default',
  ...props 
}) => {
  const Tag = `h${level}`;
  
  const getHeadingClasses = () => {
    const baseClasses = 'font-bold leading-tight';
    
    switch (level) {
      case 1:
        return cn(
          baseClasses,
          'text-responsive-h1',
          'text-2xl md:text-3xl lg:text-4xl', // Fallback for older browsers
          className
        );
      case 2:
        return cn(
          baseClasses,
          'text-xl md:text-2xl lg:text-3xl',
          className
        );
      case 3:
        return cn(
          baseClasses,
          'text-lg md:text-xl lg:text-2xl',
          className
        );
      case 4:
        return cn(
          baseClasses,
          'text-base md:text-lg lg:text-xl',
          className
        );
      case 5:
        return cn(
          baseClasses,
          'text-sm md:text-base lg:text-lg',
          className
        );
      case 6:
        return cn(
          baseClasses,
          'text-xs md:text-sm lg:text-base',
          className
        );
      default:
        return cn(baseClasses, className);
    }
  };

  return (
    <Tag className={getHeadingClasses()} {...props}>
      {children}
    </Tag>
  );
};

/**
 * Responsive hero text component for large display text
 */
export const ResponsiveHeroText = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <h1 
      className={cn(
        'text-responsive-hero',
        'text-4xl md:text-6xl lg:text-8xl', // Fallback
        'font-bold leading-none tracking-tight',
        className
      )}
      {...props}
    >
      {children}
    </h1>
  );
};

/**
 * Responsive body text component
 */
export const ResponsiveText = ({ 
  children, 
  className = '', 
  size = 'base',
  variant = 'body',
  ...props 
}) => {
  const getTextClasses = () => {
    switch (size) {
      case 'xs':
        return cn(
          'leading-relaxed',
          'text-xs md:text-sm',
          className
        );
      case 'sm':
        return cn(
          'leading-relaxed',
          'text-sm md:text-base',
          className
        );
      case 'base':
        return cn(
          'leading-relaxed',
          'text-responsive-body',
          'text-base md:text-lg', // Fallback
          className
        );
      case 'lg':
        return cn(
          'leading-relaxed',
          'text-lg md:text-xl lg:text-2xl',
          className
        );
      case 'xl':
        return cn(
          'leading-relaxed',
          'text-xl md:text-2xl lg:text-3xl',
          className
        );
      default:
        return cn('leading-relaxed', className);
    }
  };

  return (
    <p className={getTextClasses()} {...props}>
      {children}
    </p>
  );
};

/**
 * Responsive label component for forms
 */
export const ResponsiveLabel = ({ 
  children, 
  className = '', 
  required = false,
  ...props 
}) => {
  return (
    <label 
      className={cn(
        'block text-sm md:text-base font-medium text-gray-700 mb-1 md:mb-2',
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
};

/**
 * Responsive caption/helper text component
 */
export const ResponsiveCaption = ({ 
  children, 
  className = '', 
  variant = 'default',
  ...props 
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'error':
        return 'text-red-600';
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'muted':
        return 'text-gray-500';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <p 
      className={cn(
        'text-xs md:text-sm leading-relaxed',
        getVariantClasses(),
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
};

/**
 * Responsive link component with proper touch targets
 */
export const ResponsiveLink = ({ 
  children, 
  className = '', 
  variant = 'default',
  to,
  ...props 
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'text-blue-600 hover:text-blue-800';
      case 'secondary':
        return 'text-gray-600 hover:text-gray-800';
      case 'accent':
        return 'text-orange-600 hover:text-orange-800';
      default:
        return 'text-blue-600 hover:text-blue-800';
    }
  };

  // If 'to' prop is provided, use React Router Link, otherwise use regular anchor
  if (to) {
    return (
      <Link 
        to={to}
        className={cn(
          'text-sm md:text-base',
          'min-h-[44px] md:min-h-0', // Touch target on mobile
          'inline-flex items-center px-1 py-2 md:p-0', // Touch padding on mobile
          'font-medium transition-colors duration-200',
          'underline hover:no-underline',
          getVariantClasses(),
          className
        )}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <a 
      className={cn(
        'text-sm md:text-base',
        'min-h-[44px] md:min-h-0', // Touch target on mobile
        'inline-flex items-center px-1 py-2 md:p-0', // Touch padding on mobile
        'font-medium transition-colors duration-200',
        'underline hover:no-underline',
        getVariantClasses(),
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
};

/**
 * Responsive navigation text component
 */
export const ResponsiveNavText = ({ 
  children, 
  className = '', 
  active = false,
  ...props 
}) => {
  return (
    <span 
      className={cn(
        'text-sm md:text-base font-medium',
        'min-h-[44px] md:min-h-0', // Touch target on mobile
        'flex items-center px-2 py-2 md:p-0', // Touch padding on mobile
        active ? 'text-blue-600' : 'text-gray-700 hover:text-gray-900',
        'transition-colors duration-200',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

/**
 * Responsive button text component
 */
export const ResponsiveButtonText = ({ 
  children, 
  className = '', 
  size = 'base',
  ...props 
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'text-xs md:text-sm';
      case 'base':
        return 'text-sm md:text-base';
      case 'lg':
        return 'text-base md:text-lg';
      default:
        return 'text-sm md:text-base';
    }
  };

  return (
    <span 
      className={cn(
        getSizeClasses(),
        'font-medium leading-none',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

/**
 * Responsive card title component
 */
export const ResponsiveCardTitle = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <h3 
      className={cn(
        'text-lg md:text-xl lg:text-2xl',
        'font-semibold leading-tight text-gray-900',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
};

/**
 * Responsive card description component
 */
export const ResponsiveCardDescription = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <p 
      className={cn(
        'text-sm md:text-base',
        'text-gray-600 leading-relaxed',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
};

/**
 * Responsive stat number component for dashboard cards
 */
export const ResponsiveStatNumber = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <span 
      className={cn(
        'text-2xl md:text-3xl lg:text-4xl',
        'font-bold text-gray-900 leading-none',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

/**
 * Responsive stat label component for dashboard cards
 */
export const ResponsiveStatLabel = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <span 
      className={cn(
        'text-xs md:text-sm',
        'font-medium text-gray-600 leading-tight',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

// Export all components
export default {
  ResponsiveHeading,
  ResponsiveHeroText,
  ResponsiveText,
  ResponsiveLabel,
  ResponsiveCaption,
  ResponsiveLink,
  ResponsiveNavText,
  ResponsiveButtonText,
  ResponsiveCardTitle,
  ResponsiveCardDescription,
  ResponsiveStatNumber,
  ResponsiveStatLabel,
};