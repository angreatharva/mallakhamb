import React from 'react';
import PropTypes from 'prop-types';
import { FadeIn } from '../animations/FadeIn';
import { useResponsive } from '../../../hooks/useResponsive';
import { COMMON_STYLES } from '../../../styles/tokens';

/**
 * StatCard - A card component for displaying statistics
 * 
 * Features:
 * - Icon, label, value, and optional subtitle display
 * - Consistent styling with other cards
 * - Fade-in animation with configurable delay
 * - Color customization
 * - Memoized for performance optimization
 * - Optimized with shared style objects
 * 
 * @param {Object} props
 * @param {React.ComponentType} props.icon - Icon component to display
 * @param {string} props.label - Stat label text
 * @param {number|string} props.value - Stat value to display
 * @param {string} props.color - Color for icon and value
 * @param {number} props.delay - Animation delay in milliseconds
 * @param {string} props.subtitle - Optional subtitle text
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * @param {object|string} [props.padding] - Responsive padding values
 * @param {object|string} [props.fontSize] - Responsive font size for value
 * 
 * @example
 * <StatCard 
 *   icon={Users} 
 *   label="Total Users" 
 *   value={1234}
 *   color="#8B5CF6"
 *   delay={100}
 *   subtitle="Active this month"
 * />
 * 
 * @example
 * <StatCard 
 *   icon={Users} 
 *   label="Total Users" 
 *   value={1234}
 *   color="#8B5CF6"
 *   padding={{ mobile: 'sm', desktop: 'lg' }}
 *   fontSize={{ mobile: 'xl', desktop: '2xl' }}
 * />
 * 
 * **Validates: Requirements 4.3, 4.5, 4.7, 10.3, 10.5, 15.1, 15.5**
 */
const StatCardComponent = ({ 
  icon: Icon, 
  label, 
  value, 
  color, 
  delay = 0, 
  subtitle,
  className = '',
  style = {},
  padding,
  fontSize,
}) => {
  const { getResponsiveValue } = useResponsive();
  
  // Get responsive padding value
  const responsivePadding = padding ? getResponsiveValue(padding) : 'md';
  const paddingMap = {
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
  };
  const paddingValue = paddingMap[responsivePadding] || paddingMap.md;
  
  // Get responsive font size value
  const responsiveFontSize = fontSize ? getResponsiveValue(fontSize) : '2xl';
  const fontSizeMap = {
    xl: '1.5rem',
    '2xl': '2rem',
    '3xl': '2.5rem',
  };
  const fontSizeValue = fontSizeMap[responsiveFontSize] || fontSizeMap['2xl'];
  
  // Memoize static style objects to avoid recreating on every render
  const baseStyles = React.useMemo(() => ({
    ...COMMON_STYLES.cardBase,
    padding: paddingValue,
    ...style,
  }), [paddingValue, style]);

  const iconStyles = React.useMemo(() => ({
    color: color,
    width: '2.5rem',
    height: '2.5rem',
    marginBottom: '0.75rem',
  }), [color]);

  const labelStyles = React.useMemo(() => ({
    ...COMMON_STYLES.textSecondary,
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.5rem',
  }), []);

  const valueStyles = React.useMemo(() => ({
    color: color,
    fontSize: fontSizeValue,
    fontWeight: 700,
    lineHeight: 1.2,
    marginBottom: subtitle ? '0.25rem' : 0,
  }), [color, fontSizeValue, subtitle]);

  const subtitleStyles = React.useMemo(() => ({
    ...COMMON_STYLES.textMuted,
    fontSize: '0.75rem',
    fontWeight: 400,
  }), []);

  return (
    <FadeIn delay={delay} direction="up">
      <div 
        className={`stat-card ${className}`}
        style={baseStyles}
      >
        {Icon && <Icon style={iconStyles} aria-hidden="true" />}
        <div style={labelStyles}>{label}</div>
        <div style={valueStyles}>{value}</div>
        {subtitle && <div style={subtitleStyles}>{subtitle}</div>}
      </div>
    </FadeIn>
  );
};

StatCardComponent.propTypes = {
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  color: PropTypes.string.isRequired,
  delay: PropTypes.number,
  subtitle: PropTypes.string,
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
  fontSize: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
};

StatCardComponent.defaultProps = {
  icon: null,
  delay: 0,
  subtitle: null,
  className: '',
  style: {},
  padding: null,
  fontSize: null,
};

// Memoize component to prevent unnecessary re-renders
export const StatCard = React.memo(StatCardComponent);

export default StatCard;
