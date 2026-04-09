import React from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../animations/useReducedMotion';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * RadialBurst - Radial gradient background decoration
 * 
 * Renders a radial gradient burst effect that respects user motion preferences.
 * Positioned absolutely and designed to not interfere with content readability.
 * 
 * @param {Object} props
 * @param {string} props.color - Hex color for the burst (default: saffron)
 * @param {number} props.opacity - Opacity value 0-1 (default: 0.15)
 * @param {string} props.position - Position of burst: 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center' (default: 'top-right')
 * @param {string} props.size - Size of burst: 'sm', 'md', 'lg' (default: 'md')
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <RadialBurst color="#8B5CF6" position="top-left" size="lg" opacity={0.2} />
 */
const RadialBurst = ({
  color = DESIGN_TOKENS.colors.brand.saffron,
  opacity = 0.15,
  position = 'top-right',
  size = 'md',
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Size mapping
  const sizeMap = {
    sm: '400px',
    md: '600px',
    lg: '800px',
  };

  // Position mapping
  const positionStyles = {
    'top-left': { top: '-10%', left: '-10%' },
    'top-right': { top: '-10%', right: '-10%' },
    'bottom-left': { bottom: '-10%', left: '-10%' },
    'bottom-right': { bottom: '-10%', right: '-10%' },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };

  const burstSize = sizeMap[size] || sizeMap.md;
  const positionStyle = positionStyles[position] || positionStyles['top-right'];

  return (
    <div
      className={`absolute pointer-events-none ${className}`}
      style={{
        ...positionStyle,
        width: burstSize,
        height: burstSize,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        opacity,
        zIndex: 0,
        filter: 'blur(60px)',
      }}
      aria-hidden="true"
    />
  );
};

RadialBurst.propTypes = {
  color: PropTypes.string,
  opacity: PropTypes.number,
  position: PropTypes.oneOf(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
};

export default RadialBurst;
