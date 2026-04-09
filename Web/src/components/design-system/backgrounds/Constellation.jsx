import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../animations/useReducedMotion';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * Constellation - Star field with connected dots background decoration
 * 
 * Renders a star field with lines connecting nearby stars, creating a constellation effect.
 * Respects user motion preferences. Positioned absolutely and designed to not interfere with content readability.
 * 
 * @param {Object} props
 * @param {string} props.color - Hex color for stars and connections (default: saffron)
 * @param {number} props.opacity - Opacity value 0-1 (default: 0.3)
 * @param {number} props.starCount - Number of stars to render (default: 50)
 * @param {number} props.connectionDistance - Maximum distance for connecting stars (default: 150)
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <Constellation color="#8B5CF6" starCount={60} opacity={0.4} />
 */
const Constellation = ({
  color = DESIGN_TOKENS.colors.brand.saffron,
  opacity = 0.3,
  starCount = 50,
  connectionDistance = 150,
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Generate random star positions (memoized to prevent regeneration on re-renders)
  const stars = useMemo(() => {
    const starArray = [];
    for (let i = 0; i < starCount; i++) {
      starArray.push({
        x: Math.random() * 100, // Percentage
        y: Math.random() * 100, // Percentage
        size: Math.random() * 2 + 1, // 1-3px
      });
    }
    return starArray;
  }, [starCount]);

  // Calculate connections between nearby stars
  const connections = useMemo(() => {
    const connectionArray = [];
    
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[j].x - stars[i].x;
        const dy = stars[j].y - stars[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Connect stars within connectionDistance (as percentage of viewport)
        if (distance < connectionDistance / 10) { // Adjust for percentage scale
          connectionArray.push({
            x1: stars[i].x,
            y1: stars[i].y,
            x2: stars[j].x,
            y2: stars[j].y,
          });
        }
      }
    }
    
    return connectionArray;
  }, [stars, connectionDistance]);

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
        {/* Render connection lines */}
        {connections.map((conn, index) => (
          <line
            key={`connection-${index}`}
            x1={`${conn.x1}%`}
            y1={`${conn.y1}%`}
            x2={`${conn.x2}%`}
            y2={`${conn.y2}%`}
            stroke={color}
            strokeWidth="0.5"
            strokeOpacity="0.3"
          />
        ))}
        
        {/* Render stars */}
        {stars.map((star, index) => (
          <circle
            key={`star-${index}`}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.size}
            fill={color}
          />
        ))}
      </svg>
    </div>
  );
};

Constellation.propTypes = {
  color: PropTypes.string,
  opacity: PropTypes.number,
  starCount: PropTypes.number,
  connectionDistance: PropTypes.number,
  className: PropTypes.string,
};

export default Constellation;
