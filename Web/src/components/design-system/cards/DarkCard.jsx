import React from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../theme/useTheme';
import { useResponsive } from '../../../hooks/useResponsive';
import { COMMON_STYLES } from '../../../styles/tokens';

/**
 * DarkCard - A card component with dark glassmorphism styling
 *
 * Features:
 * - Dark glassmorphism background
 * - Subtle border with role-specific accent on hover
 * - Optional hover animation
 * - Support for custom className and style props
 * - Memoized for performance optimization
 * - Optimized with shared style objects
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * @param {boolean} props.hover - Enable hover animation
 * @param {object|string} [props.padding] - Responsive padding values (e.g., { mobile: 'sm', desktop: 'lg' } or 'md')
 *
 * @example
 * <DarkCard hover>
 *   <h2>Card Title</h2>
 *   <p>Card content goes here</p>
 * </DarkCard>
 *
 * @example
 * <DarkCard padding={{ mobile: 'sm', desktop: 'lg' }}>
 *   <p>Responsive padding card</p>
 * </DarkCard>
 *
 * **Validates: Requirements 4.2, 4.5, 4.6, 4.7, 10.3, 10.5, 15.1, 15.5**
 */
const DarkCardComponent = ({ children, className = '', style = {}, hover = false, padding }) => {
  const theme = useTheme();
  const { getResponsiveValue } = useResponsive();
  const [isHovered, setIsHovered] = React.useState(false);

  // Get responsive padding value
  const responsivePadding = padding ? getResponsiveValue(padding) : 'md';
  const paddingMap = {
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
  };
  const paddingValue = paddingMap[responsivePadding] || paddingMap.md;

  // Use shared style object and memoize combined styles
  const baseStyles = React.useMemo(
    () => ({
      ...COMMON_STYLES.cardBase,
      border: `1px solid ${isHovered && hover ? theme.colors.primary : 'rgba(255, 255, 255, 0.06)'}`,
      padding: paddingValue,
      ...COMMON_STYLES.transitionAll,
      transform: isHovered && hover ? 'translateY(-2px)' : 'translateY(0)',
      ...style,
    }),
    [isHovered, hover, theme.colors.primary, paddingValue, style]
  );

  return (
    <div
      className={`dark-card ${className}`}
      style={baseStyles}
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
    >
      {children}
    </div>
  );
};

DarkCardComponent.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  hover: PropTypes.bool,
  padding: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
};

DarkCardComponent.defaultProps = {
  className: '',
  style: {},
  hover: false,
  padding: null,
};

// Memoize component to prevent unnecessary re-renders
export const DarkCard = React.memo(DarkCardComponent);

export default DarkCard;
