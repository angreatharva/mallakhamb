import React from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../animations/useReducedMotion';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * HexGrid - SVG-based hexagonal pattern background decoration
 * 
 * Renders a non-interactive hexagonal grid pattern that respects user motion preferences.
 * Positioned absolutely and designed to not interfere with content readability.
 * 
 * @param {Object} props
 * @param {string} props.color - Hex color for the pattern (default: saffron)
 * @param {number} props.opacity - Opacity value 0-1 (default: 0.03)
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <HexGrid color="#8B5CF6" opacity={0.05} />
 */
const HexGrid = ({ color = DESIGN_TOKENS.colors.brand.saffron, opacity = 0.03, className = '' }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity }}
      >
        <defs>
          {/* Define hexagon pattern */}
          <pattern
            id="hexgrid"
            x="0"
            y="0"
            width="56"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            {/* First hexagon */}
            <path
              d="M28 0 L42 8 L42 24 L28 32 L14 24 L14 8 Z"
              fill="none"
              stroke={color}
              strokeWidth="1"
            />
            {/* Second hexagon (offset) */}
            <path
              d="M0 50 L14 58 L14 74 L0 82 L-14 74 L-14 58 Z"
              fill="none"
              stroke={color}
              strokeWidth="1"
            />
            {/* Third hexagon (offset) */}
            <path
              d="M56 50 L70 58 L70 74 L56 82 L42 74 L42 58 Z"
              fill="none"
              stroke={color}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        
        {/* Apply pattern to full viewport */}
        <rect
          width="100%"
          height="100%"
          fill="url(#hexgrid)"
        />
      </svg>
    </div>
  );
};

HexGrid.propTypes = {
  color: PropTypes.string,
  opacity: PropTypes.number,
  className: PropTypes.string,
};

export default HexGrid;
