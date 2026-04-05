import React from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../theme/useTheme';

/**
 * DarkCard - A card component with dark glassmorphism styling
 * 
 * Features:
 * - Dark glassmorphism background
 * - Subtle border with role-specific accent on hover
 * - Optional hover animation
 * - Support for custom className and style props
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * @param {boolean} props.hover - Enable hover animation
 * 
 * @example
 * <DarkCard hover>
 *   <h2>Card Title</h2>
 *   <p>Card content goes here</p>
 * </DarkCard>
 * 
 * **Validates: Requirements 4.2, 4.5, 4.6, 4.7**
 */
export const DarkCard = ({ children, className = '', style = {}, hover = false }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyles = {
    background: 'rgba(17, 17, 17, 0.8)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)', // Safari support
    border: `1px solid ${isHovered && hover ? theme.colors.primary : 'rgba(255, 255, 255, 0.06)'}`,
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '1.5rem',
    transition: 'all 0.3s ease',
    transform: isHovered && hover ? 'translateY(-2px)' : 'translateY(0)',
    ...style,
  };

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

DarkCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  hover: PropTypes.bool,
};

DarkCard.defaultProps = {
  className: '',
  style: {},
  hover: false,
};

export default DarkCard;
