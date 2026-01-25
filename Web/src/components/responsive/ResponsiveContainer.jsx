/**
 * ResponsiveContainer Component
 * 
 * A flexible container component that adapts its layout, padding, and max-width
 * based on the current viewport size. Follows mobile-first design principles.
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2
 */

import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { getResponsiveLayout, getResponsiveSpacing } from '../../utils/responsive';

/**
 * ResponsiveContainer component for consistent responsive layouts
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {'mobile' | 'tablet' | 'desktop' | 'full'} props.maxWidth - Maximum width constraint
 * @param {'mobile' | 'tablet' | 'desktop' | 'responsive'} props.padding - Padding size category
 * @param {boolean} props.centered - Whether to center the container
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.as - HTML element type (default: 'div')
 * @returns {JSX.Element}
 */
export const ResponsiveContainer = ({
  children,
  maxWidth = 'desktop',
  padding = 'responsive',
  centered = true,
  className = '',
  as: Component = 'div',
  ...props
}) => {
  const { viewport, isMobile, isTablet, isDesktop } = useResponsive();
  
  // Get responsive layout configuration
  const layout = getResponsiveLayout('container');
  
  // Determine container classes based on props and viewport
  const getContainerClasses = () => {
    const classes = ['w-full'];
    
    // Add centering if enabled
    if (centered) {
      classes.push('mx-auto');
    }
    
    // Add responsive padding - mobile-first approach
    if (padding === 'responsive') {
      classes.push('px-4 md:px-6 lg:px-8 desktop:px-8');
    } else if (padding === 'mobile') {
      classes.push('px-4');
    } else if (padding === 'tablet') {
      classes.push('px-6');
    } else if (padding === 'desktop') {
      classes.push('px-8');
    } else if (padding) {
      // Custom padding class
      classes.push(padding);
    }
    
    // Add max-width constraints for different viewport categories
    switch (maxWidth) {
      case 'mobile':
        classes.push('max-w-mobile');
        break;
      case 'tablet':
        classes.push('max-w-tablet md:max-w-tablet-content');
        break;
      case 'desktop':
        classes.push('max-w-mobile md:max-w-tablet-content lg:max-w-desktop desktop:max-w-desktop-wide');
        break;
      case 'full':
        // No max-width constraint - full viewport width
        break;
      default:
        classes.push('max-w-mobile md:max-w-tablet-content lg:max-w-desktop desktop:max-w-desktop-wide');
    }
    
    return classes.join(' ');
  };
  
  const containerClasses = `${getContainerClasses()} ${className}`.trim();
  
  return (
    <Component className={containerClasses} {...props}>
      {children}
    </Component>
  );
};

/**
 * Specialized container for centered content with responsive max-widths
 * Mobile-first approach with progressive enhancement
 */
export const ResponsiveCenteredContainer = ({ children, className = '', ...props }) => (
  <ResponsiveContainer
    centered={true}
    padding="responsive"
    maxWidth="desktop"
    className={`container-centered ${className}`}
    {...props}
  >
    {children}
  </ResponsiveContainer>
);

/**
 * Full-width container that breaks out of parent constraints on mobile
 * Ensures no horizontal scrolling while maintaining desktop layouts
 */
export const ResponsiveFullWidthContainer = ({ children, className = '', ...props }) => {
  const { isMobile } = useResponsive();
  
  const fullWidthClasses = isMobile ? 'mobile-full-width no-horizontal-scroll' : '';
  
  return (
    <ResponsiveContainer
      maxWidth="full"
      padding="responsive"
      className={`${fullWidthClasses} ${className}`}
      {...props}
    >
      {children}
    </ResponsiveContainer>
  );
};

/**
 * Section container with responsive vertical spacing
 * Provides consistent section-level spacing across viewports
 */
export const ResponsiveSectionContainer = ({ children, className = '', ...props }) => {
  return (
    <ResponsiveContainer
      maxWidth="desktop"
      padding="responsive"
      className={`py-section-mobile md:py-section-tablet lg:py-section-desktop ${className}`}
      {...props}
    >
      {children}
    </ResponsiveContainer>
  );
};

/**
 * Form container optimized for mobile interaction
 * Provides optimal form layout across all viewport sizes
 */
export const ResponsiveFormContainer = ({ children, className = '', ...props }) => {
  return (
    <ResponsiveContainer
      maxWidth="tablet"
      padding="responsive"
      className={`space-y-4 md:space-y-6 ${className}`}
      {...props}
    >
      {children}
    </ResponsiveContainer>
  );
};

export default ResponsiveContainer;