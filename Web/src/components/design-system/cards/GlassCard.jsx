import React from 'react';
import PropTypes from 'prop-types';

/**
 * GlassCard - A card component with glassmorphism styling
 * 
 * Features:
 * - Backdrop blur effect for glassmorphism
 * - Consistent border radius and shadows
 * - Responsive behavior on mobile devices
 * - Support for custom className and style props
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * 
 * @example
 * <GlassCard>
 *   <h2>Card Title</h2>
 *   <p>Card content goes here</p>
 * </GlassCard>
 * 
 * **Validates: Requirements 4.1, 4.5, 4.6, 4.7**
 */
export const GlassCard = ({ children, className = '', style = {} }) => {
  const baseStyles = {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)', // Safari support
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    padding: '1.5rem',
    transition: 'all 0.3s ease',
    ...style,
  };

  return (
    <div 
      className={`glass-card ${className}`}
      style={baseStyles}
    >
      {children}
    </div>
  );
};

GlassCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
};

GlassCard.defaultProps = {
  className: '',
  style: {},
};

export default GlassCard;
