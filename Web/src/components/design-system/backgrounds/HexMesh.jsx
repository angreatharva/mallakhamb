import React from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../animations/useReducedMotion';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * HexMesh - SVG-based mesh pattern background decoration
 *
 * Renders a mesh pattern with interconnected lines that respects user motion preferences.
 * Positioned absolutely and designed to not interfere with content readability.
 *
 * @param {Object} props
 * @param {string} props.color - Hex color for the mesh (default: saffron)
 * @param {number} props.opacity - Opacity value 0-1 (default: 0.04)
 * @param {string} props.className - Additional CSS classes
 *
 * @example
 * <HexMesh color="#22C55E" opacity={0.06} />
 */
const HexMesh = ({
  color = DESIGN_TOKENS.colors.brand.saffron,
  opacity = 0.04,
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
        <defs>
          {/* Define mesh pattern */}
          <pattern id="hexmesh" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            {/* Horizontal lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke={color} strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke={color} strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke={color} strokeWidth="0.5" />

            {/* Vertical lines */}
            <line x1="25" y1="0" x2="25" y2="100" stroke={color} strokeWidth="0.5" />
            <line x1="50" y1="0" x2="50" y2="100" stroke={color} strokeWidth="0.5" />
            <line x1="75" y1="0" x2="75" y2="100" stroke={color} strokeWidth="0.5" />

            {/* Diagonal lines for mesh effect */}
            <line x1="0" y1="0" x2="25" y2="25" stroke={color} strokeWidth="0.5" />
            <line x1="25" y1="0" x2="50" y2="25" stroke={color} strokeWidth="0.5" />
            <line x1="50" y1="0" x2="75" y2="25" stroke={color} strokeWidth="0.5" />
            <line x1="75" y1="0" x2="100" y2="25" stroke={color} strokeWidth="0.5" />

            <line x1="0" y1="25" x2="25" y2="50" stroke={color} strokeWidth="0.5" />
            <line x1="25" y1="25" x2="50" y2="50" stroke={color} strokeWidth="0.5" />
            <line x1="50" y1="25" x2="75" y2="50" stroke={color} strokeWidth="0.5" />
            <line x1="75" y1="25" x2="100" y2="50" stroke={color} strokeWidth="0.5" />

            {/* Dots at intersections */}
            <circle cx="25" cy="25" r="1.5" fill={color} />
            <circle cx="50" cy="25" r="1.5" fill={color} />
            <circle cx="75" cy="25" r="1.5" fill={color} />
            <circle cx="25" cy="50" r="1.5" fill={color} />
            <circle cx="50" cy="50" r="1.5" fill={color} />
            <circle cx="75" cy="50" r="1.5" fill={color} />
            <circle cx="25" cy="75" r="1.5" fill={color} />
            <circle cx="50" cy="75" r="1.5" fill={color} />
            <circle cx="75" cy="75" r="1.5" fill={color} />
          </pattern>
        </defs>

        {/* Apply pattern to full viewport */}
        <rect width="100%" height="100%" fill="url(#hexmesh)" />
      </svg>
    </div>
  );
};

HexMesh.propTypes = {
  color: PropTypes.string,
  opacity: PropTypes.number,
  className: PropTypes.string,
};

export default HexMesh;
