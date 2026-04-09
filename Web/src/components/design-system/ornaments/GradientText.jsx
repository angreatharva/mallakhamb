import { motion } from 'framer-motion';
import { useReducedMotion } from '../animations/useReducedMotion';
import { useTheme } from '../theme/useTheme';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * GradientText - Animated gradient text component
 * 
 * Displays text with a gradient color effect and optional animation.
 * Respects prefers-reduced-motion setting.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Text content to display
 * @param {string} props.className - Additional CSS classes
 * @param {Array<string>} props.colors - Array of gradient colors (default: uses theme colors)
 * @param {boolean} props.animate - Enable gradient animation (default: false)
 * 
 * @example
 * <GradientText>Hello World</GradientText>
 * <GradientText colors={['#FF6B00', '#F5A623', '#FF8C38']} animate>
 *   Animated Text
 * </GradientText>
 */
const GradientText = ({ 
  children, 
  className = '', 
  colors,
  animate = false 
}) => {
  const reduced = useReducedMotion();
  const theme = useTheme();
  
  // Determine gradient colors
  let gradientColors;
  
  if (colors && Array.isArray(colors) && colors.length >= 2) {
    // Use provided colors
    gradientColors = colors;
  } else if (theme?.colors?.primary) {
    // Use theme colors
    gradientColors = [
      theme.colors.primary,
      theme.colors.primaryLight || theme.colors.primary,
      theme.colors.primary,
    ];
  } else {
    // Fallback to saffron gradient
    gradientColors = [
      DESIGN_TOKENS.colors.brand.saffron,
      DESIGN_TOKENS.colors.brand.gold,
      DESIGN_TOKENS.colors.brand.saffronLight,
    ];
  }
  
  // Create gradient string
  const gradientString = `linear-gradient(135deg, ${gradientColors.join(', ')})`;
  
  // Base styles
  const baseStyle = {
    background: gradientString,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };
  
  // Animation styles (only if animate is true and motion is not reduced)
  const shouldAnimate = animate && !reduced;
  
  if (shouldAnimate) {
    return (
      <motion.span
        className={className}
        style={{
          ...baseStyle,
          backgroundSize: '200% 200%',
        }}
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {children}
      </motion.span>
    );
  }
  
  // Static gradient text
  return (
    <span className={className} style={baseStyle}>
      {children}
    </span>
  );
};

export default GradientText;
