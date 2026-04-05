import React from 'react';
import PropTypes from 'prop-types';
import { FadeIn } from '../animations/FadeIn';

/**
 * StatCard - A card component for displaying statistics
 * 
 * Features:
 * - Icon, label, value, and optional subtitle display
 * - Consistent styling with other cards
 * - Fade-in animation with configurable delay
 * - Color customization
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
 * **Validates: Requirements 4.3, 4.5, 4.7**
 */
export const StatCard = ({ 
  icon: Icon, 
  label, 
  value, 
  color, 
  delay = 0, 
  subtitle,
  className = '',
  style = {}
}) => {
  const baseStyles = {
    background: 'rgba(17, 17, 17, 0.8)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)', // Safari support
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '1.5rem',
    ...style,
  };

  const iconStyles = {
    color: color,
    width: '2.5rem',
    height: '2.5rem',
    marginBottom: '0.75rem',
  };

  const labelStyles = {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.5rem',
  };

  const valueStyles = {
    color: color,
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.2,
    marginBottom: subtitle ? '0.25rem' : 0,
  };

  const subtitleStyles = {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '0.75rem',
    fontWeight: 400,
  };

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

StatCard.propTypes = {
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  color: PropTypes.string.isRequired,
  delay: PropTypes.number,
  subtitle: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
};

StatCard.defaultProps = {
  icon: null,
  delay: 0,
  subtitle: null,
  className: '',
  style: {},
};

export default StatCard;
