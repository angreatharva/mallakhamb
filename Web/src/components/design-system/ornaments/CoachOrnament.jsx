import { UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../animations/useReducedMotion';
import { useTheme } from '../theme/useTheme';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * CoachOrnament - Role-specific ornament component for coach role
 * 
 * Displays an animated user check icon with coach-specific styling.
 * Respects prefers-reduced-motion setting.
 * 
 * @param {Object} props
 * @param {string} props.size - Size variant: 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} props.color - Custom color override (uses theme color by default)
 * 
 * @example
 * <CoachOrnament size="lg" />
 * <CoachOrnament color="#FF6B00" />
 */
const CoachOrnament = ({ size = 'md', color }) => {
  const reduced = useReducedMotion();
  const theme = useTheme();
  
  // Use provided color or fall back to theme primary color or coach green
  const primaryColor = color || theme?.colors?.primary || DESIGN_TOKENS.colors.roles.coach;
  
  // Derive darker shade for gradient
  const darkerColor = color 
    ? color 
    : (theme?.colors?.primaryDark || DESIGN_TOKENS.colors.extended.greenDark);
  
  // Size configurations
  const sizeConfig = {
    sm: { outer: 24, middle: 16, inner: 12, icon: 6 },
    md: { outer: 36, middle: 24, inner: 20, icon: 10 },
    lg: { outer: 48, middle: 32, inner: 26, icon: 13 },
  };
  
  const sizes = sizeConfig[size] || sizeConfig.md;
  
  return (
    <motion.div 
      className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ 
        duration: 0.9, 
        delay: 0.3, 
        type: 'spring', 
        stiffness: 200, 
        damping: 18 
      }}
    >
      {/* Outer rotating dashed ring (counter-clockwise) */}
      {!reduced && (
        <motion.div 
          className="absolute rounded-full border"
          style={{ 
            width: `${sizes.outer}rem`,
            height: `${sizes.outer}rem`,
            borderColor: `${primaryColor}22`, 
            borderStyle: 'dashed' 
          }}
          animate={{ rotate: -360 }}
          transition={{ 
            duration: 24, 
            repeat: Infinity, 
            ease: 'linear' 
          }} 
        />
      )}
      
      {/* Middle pulsing ring */}
      <motion.div 
        className="absolute rounded-full border"
        style={{ 
          width: `${sizes.middle}rem`,
          height: `${sizes.middle}rem`,
          borderColor: `${primaryColor}30` 
        }}
        animate={reduced ? {} : { 
          scale: [1, 1.06, 1], 
          opacity: [0.6, 1, 0.6] 
        }}
        transition={{ 
          duration: 3.5, 
          repeat: Infinity, 
          ease: 'easeInOut' 
        }} 
      />
      
      {/* Inner icon container */}
      <div 
        className="relative rounded-2xl flex items-center justify-center"
        style={{
          width: `${sizes.inner}rem`,
          height: `${sizes.inner}rem`,
          background: `linear-gradient(135deg, ${primaryColor}20, ${darkerColor}15)`,
          border: `1px solid ${primaryColor}40`,
          boxShadow: `0 0 40px ${primaryColor}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {/* UserCheck icon */}
        <UserCheck 
          className="relative z-10" 
          style={{ 
            width: `${sizes.icon}rem`,
            height: `${sizes.icon}rem`,
            color: primaryColor 
          }} 
          aria-hidden="true" 
        />
      </div>
    </motion.div>
  );
};

export default CoachOrnament;
