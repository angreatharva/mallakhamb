import React from 'react';
import PropTypes from 'prop-types';
import { useResponsive } from '../../../hooks/useResponsive';
import { COMMON_STYLES } from '../../../styles/tokens';

/**
 * GlassCard - A card component with glassmorphism styling
 * 
 * Features:
 * - Backdrop blur effect for glassmorphism
 * - Consistent border radius and shadows
 * - Responsive behavior on mobile devices
 * - Support for custom className and style props
 * - Optimized with shared style objects
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * @param {object|string} [props.padding] - Responsive padding values
 * 
 * @example
 * <GlassCard>
 *   <h2>Card Title</h2>
 *   <p>Card content goes here</p>
 * </GlassCard>
 * 
 * **Validates: Requirements 4.1, 4.5, 4.6, 4.7, 10.5, 15.1, 15.5**
 */
const GlassCardComponent = ({ children, className = '', style = {}, padding }) => {
  const { getResponsiveValue } = useResponsive();
  
  // Get responsive padding value
  const responsivePadding = padding ? getResponsiveValue(padding) : 'md';
  const paddingMap = {
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
  };
  const paddingValue = paddingMap[responsivePadding] || paddingMap.md;
  
  // Use shared style object and memoize combined styles
  const baseStyles = React.useMemo(() => ({
    ...COMMON_STYLES.glassCard,
    padding: paddingValue,
    ...COMMON_STYLES.transitionAll,
    ...style,
  }), [paddingValue, style]);

  return (
    <div 
      className={`glass-card ${className}`}
      style={baseStyles}
    >
      {children}
    </div>
  );
};

GlassCardComponent.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  padding: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
};

GlassCardComponent.defaultProps = {
  className: '',
  style: {},
  padding: null,
};

// Memoize component to prevent unnecessary re-renders
export const GlassCard = React.memo(GlassCardComponent);

export default GlassCard;
