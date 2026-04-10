import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../animations/useReducedMotion';

/**
 * TiltCard - A card component with 3D tilt effects
 *
 * Features:
 * - 3D tilt effects using framer-motion
 * - Respects prefers-reduced-motion setting
 * - Support for custom className and style props
 * - Smooth hover animations
 * - Memoized for performance optimization
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {React.CSSProperties} props.style - Additional inline styles
 * @param {number} props.maxTilt - Maximum tilt angle in degrees
 *
 * @example
 * <TiltCard maxTilt={10}>
 *   <h2>Card Title</h2>
 *   <p>Card content goes here</p>
 * </TiltCard>
 *
 * **Validates: Requirements 4.4, 4.6, 4.7, 10.3**
 */
const TiltCardComponent = ({ children, className = '', style = {}, maxTilt = 10 }) => {
  const shouldReduceMotion = useReducedMotion();
  const [tiltX, setTiltX] = React.useState(0);
  const [tiltY, setTiltY] = React.useState(0);

  const handleMouseMove = React.useCallback(
    (e) => {
      if (shouldReduceMotion) return;

      const card = e.currentTarget;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calculate tilt based on mouse position relative to center
      const tiltXValue = ((y - centerY) / centerY) * maxTilt;
      const tiltYValue = ((x - centerX) / centerX) * -maxTilt;

      setTiltX(tiltXValue);
      setTiltY(tiltYValue);
    },
    [shouldReduceMotion, maxTilt]
  );

  const handleMouseLeave = React.useCallback(() => {
    setTiltX(0);
    setTiltY(0);
  }, []);

  const baseStyles = React.useMemo(
    () => ({
      background: 'rgba(17, 17, 17, 0.8)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)', // Safari support
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '12px',
      boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
      padding: '1.5rem',
      transformStyle: 'preserve-3d',
      ...style,
    }),
    [style]
  );

  const motionProps = shouldReduceMotion
    ? {}
    : {
        animate: {
          rotateX: tiltX,
          rotateY: tiltY,
        },
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 30,
        },
      };

  return (
    <motion.div
      className={`tilt-card ${className}`}
      style={baseStyles}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
};

TiltCardComponent.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  maxTilt: PropTypes.number,
};

TiltCardComponent.defaultProps = {
  className: '',
  style: {},
  maxTilt: 10,
};

// Memoize component to prevent unnecessary re-renders
export const TiltCard = React.memo(TiltCardComponent);

export default TiltCard;
