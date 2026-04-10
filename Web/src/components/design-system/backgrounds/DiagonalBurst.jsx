import React from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../animations/useReducedMotion';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * DiagonalBurst - Diagonal gradient background decoration
 *
 * Renders a diagonal gradient effect that respects user motion preferences.
 * Positioned absolutely and designed to not interfere with content readability.
 *
 * @param {Object} props
 * @param {string} props.color - Hex color for the gradient (default: saffron)
 * @param {number} props.opacity - Opacity value 0-1 (default: 0.08)
 * @param {string} props.direction - Gradient direction: 'top-left-to-bottom-right', 'top-right-to-bottom-left', 'bottom-left-to-top-right', 'bottom-right-to-top-left' (default: 'top-left-to-bottom-right')
 * @param {string} props.className - Additional CSS classes
 *
 * @example
 * <DiagonalBurst color="#8B5CF6" direction="top-right-to-bottom-left" opacity={0.1} />
 */
const DiagonalBurst = ({
  color = DESIGN_TOKENS.colors.brand.saffron,
  opacity = 0.08,
  direction = 'top-left-to-bottom-right',
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Direction mapping to CSS gradient angles
  const directionMap = {
    'top-left-to-bottom-right': '135deg',
    'top-right-to-bottom-left': '225deg',
    'bottom-left-to-top-right': '45deg',
    'bottom-right-to-top-left': '315deg',
  };

  const angle = directionMap[direction] || directionMap['top-left-to-bottom-right'];

  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        background: `linear-gradient(${angle}, ${color} 0%, transparent 50%, ${color} 100%)`,
        opacity,
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
};

DiagonalBurst.propTypes = {
  color: PropTypes.string,
  opacity: PropTypes.number,
  direction: PropTypes.oneOf([
    'top-left-to-bottom-right',
    'top-right-to-bottom-left',
    'bottom-left-to-top-right',
    'bottom-right-to-top-left',
  ]),
  className: PropTypes.string,
};

export default DiagonalBurst;
