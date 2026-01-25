/**
 * ResponsiveGrid Component
 * 
 * A flexible grid component that adapts its column count, gap, and layout
 * based on the current viewport size. Supports various grid patterns with
 * mobile-first CSS Grid implementation.
 * 
 * Requirements: 2.1, 3.2, 8.1
 */

import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { getResponsiveGrid, getResponsiveSpacing } from '../../utils/responsive';

/**
 * ResponsiveGrid component for adaptive layouts
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {'autoFit' | 'cards' | 'form' | 'table' | 'custom'} props.type - Grid type configuration
 * @param {Object} props.columns - Custom column configuration per breakpoint
 * @param {Object} props.gap - Custom gap configuration per breakpoint
 * @param {string} props.minItemWidth - Minimum item width for auto-fit grids
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.as - HTML element type (default: 'div')
 * @returns {JSX.Element}
 */
export const ResponsiveGrid = ({
  children,
  type = 'autoFit',
  columns = null,
  gap = null,
  minItemWidth = '250px',
  className = '',
  as: Component = 'div',
  ...props
}) => {
  const { viewport, isMobile, isTablet, isDesktop } = useResponsive();
  
  // Get grid configuration based on type
  const gridConfig = getResponsiveGrid(type);
  
  // Determine grid styles based on viewport and configuration
  const getGridStyles = () => {
    const styles = {
      display: 'grid',
    };
    
    // Set responsive columns - mobile-first approach
    if (columns) {
      // Custom column configuration
      if (isMobile && columns.mobile) {
        styles.gridTemplateColumns = columns.mobile;
      } else if (isTablet && columns.tablet) {
        styles.gridTemplateColumns = columns.tablet;
      } else if (isDesktop && columns.desktop) {
        styles.gridTemplateColumns = columns.desktop;
      } else {
        // Fallback to desktop configuration
        styles.gridTemplateColumns = columns.desktop || columns.tablet || columns.mobile || '1fr';
      }
    } else {
      // Use type-based configuration
      if (type === 'autoFit') {
        if (isMobile) {
          styles.gridTemplateColumns = '1fr';
        } else if (isTablet) {
          styles.gridTemplateColumns = `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`;
        } else {
          styles.gridTemplateColumns = `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`;
        }
      } else if (typeof gridConfig.columns === 'number') {
        styles.gridTemplateColumns = `repeat(${gridConfig.columns}, 1fr)`;
      } else {
        styles.gridTemplateColumns = gridConfig.columns;
      }
    }
    
    // Set responsive gap - mobile-first approach
    if (gap) {
      if (isMobile && gap.mobile) {
        styles.gap = gap.mobile;
      } else if (isTablet && gap.tablet) {
        styles.gap = gap.tablet;
      } else if (isDesktop && gap.desktop) {
        styles.gap = gap.desktop;
      } else {
        styles.gap = gap.desktop || gap.tablet || gap.mobile || '1rem';
      }
    } else {
      // Use responsive spacing
      if (isMobile) {
        styles.gap = getResponsiveSpacing('gap') || '0.75rem';
      } else if (isTablet) {
        styles.gap = getResponsiveSpacing('gap') || '1rem';
      } else {
        styles.gap = getResponsiveSpacing('gap') || '1.5rem';
      }
    }
    
    return styles;
  };
  
  // Get responsive grid classes
  const getGridClasses = () => {
    const classes = [];
    
    // Add type-specific classes
    switch (type) {
      case 'cards':
        classes.push('grid-responsive-cards');
        break;
      case 'form':
        classes.push('grid-responsive-form');
        break;
      case 'table':
        classes.push('grid-responsive-table');
        break;
      case 'autoFit':
        classes.push('grid-responsive-auto');
        break;
      default:
        classes.push('grid-responsive-custom');
    }
    
    // Add responsive utilities
    classes.push('w-full');
    
    return classes.join(' ');
  };
  
  const gridClasses = `${getGridClasses()} ${className}`.trim();
  const gridStyles = getGridStyles();
  
  return (
    <Component 
      className={gridClasses} 
      style={gridStyles}
      {...props}
    >
      {children}
    </Component>
  );
};

/**
 * Specialized grid for card layouts with responsive column counts
 * Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns
 */
export const ResponsiveCardGrid = ({ children, className = '', ...props }) => {
  const cardColumns = {
    mobile: '1fr',
    tablet: 'repeat(2, 1fr)',
    desktop: 'repeat(auto-fit, minmax(280px, 1fr))'
  };
  
  const cardGap = {
    mobile: '1rem',
    tablet: '1.25rem',
    desktop: '1.5rem'
  };
  
  return (
    <ResponsiveGrid
      type="cards"
      columns={cardColumns}
      gap={cardGap}
      className={`responsive-card-grid ${className}`}
      {...props}
    >
      {children}
    </ResponsiveGrid>
  );
};

/**
 * Specialized grid for form layouts with mobile-first stacking
 * Mobile: Single column, Tablet+: Two columns for optimal form UX
 */
export const ResponsiveFormGrid = ({ children, className = '', ...props }) => {
  const formColumns = {
    mobile: '1fr',
    tablet: 'repeat(2, 1fr)',
    desktop: 'repeat(2, 1fr)'
  };
  
  const formGap = {
    mobile: '1rem',
    tablet: '1.25rem',
    desktop: '1.5rem'
  };
  
  return (
    <ResponsiveGrid
      type="form"
      columns={formColumns}
      gap={formGap}
      className={`responsive-form-grid ${className}`}
      {...props}
    >
      {children}
    </ResponsiveGrid>
  );
};

/**
 * Auto-fit grid that adapts to content size with responsive minimum widths
 * Automatically adjusts column count based on available space
 */
export const ResponsiveAutoGrid = ({ 
  children, 
  minItemWidth = '250px',
  className = '', 
  ...props 
}) => {
  const autoColumns = {
    mobile: '1fr',
    tablet: `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`,
    desktop: `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`
  };
  
  return (
    <ResponsiveGrid
      type="autoFit"
      columns={autoColumns}
      minItemWidth={minItemWidth}
      className={`responsive-auto-grid ${className}`}
      {...props}
    >
      {children}
    </ResponsiveGrid>
  );
};

/**
 * Dashboard grid optimized for data display and widgets
 * Responsive column counts optimized for dashboard layouts
 */
export const ResponsiveDashboardGrid = ({ children, className = '', ...props }) => {
  const dashboardColumns = {
    mobile: '1fr',
    tablet: 'repeat(2, 1fr)',
    desktop: 'repeat(4, 1fr)'
  };
  
  const dashboardGap = {
    mobile: '1rem',
    tablet: '1.5rem',
    desktop: '2rem'
  };
  
  return (
    <ResponsiveGrid
      type="cards"
      columns={dashboardColumns}
      gap={dashboardGap}
      className={`responsive-dashboard-grid ${className}`}
      {...props}
    >
      {children}
    </ResponsiveGrid>
  );
};

/**
 * Masonry-style grid for varied content heights with responsive columns
 * Uses CSS Grid with auto-fit for masonry-like behavior
 */
export const ResponsiveMasonryGrid = ({ children, className = '', minItemWidth = '300px', ...props }) => {
  const { isMobile, isTablet } = useResponsive();
  
  // Dynamic masonry styles based on viewport
  const masonryStyles = {
    display: 'grid',
    gridTemplateColumns: isMobile 
      ? '1fr' 
      : isTablet 
        ? 'repeat(2, 1fr)'
        : `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`,
    gridAutoRows: 'min-content',
    gap: isMobile ? '1rem' : isTablet ? '1.25rem' : '1.5rem',
    alignItems: 'start'
  };
  
  return (
    <div 
      className={`responsive-masonry-grid w-full ${className}`}
      style={masonryStyles}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Table grid for responsive data display
 * Adapts between table layout and card layout on mobile
 */
export const ResponsiveTableGrid = ({ children, className = '', ...props }) => {
  const { isMobile } = useResponsive();
  
  const tableColumns = {
    mobile: '1fr', // Stack as cards on mobile
    tablet: 'auto', // Auto-sized columns on tablet
    desktop: 'auto' // Auto-sized columns on desktop
  };
  
  const tableGap = {
    mobile: '0.5rem',
    tablet: '1rem',
    desktop: '1rem'
  };
  
  return (
    <ResponsiveGrid
      type="table"
      columns={tableColumns}
      gap={tableGap}
      className={`responsive-table-grid ${isMobile ? 'mobile-card-layout' : ''} ${className}`}
      {...props}
    >
      {children}
    </ResponsiveGrid>
  );
};

export default ResponsiveGrid;