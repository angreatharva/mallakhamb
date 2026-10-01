import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../theme/useTheme';
import { useResponsive } from '../../../hooks/useResponsive';

/**
 * ThemedButton - A themed button component that adapts to the current role context
 * 
 * Features:
 * - Variants: solid, outline, ghost
 * - Sizes: sm, md, lg
 * - Loading state with spinner
 * - Icon support
 * - Minimum 44px touch target
 * - Disabled state
 * 
 * @param {Object} props
 * @param {'solid'|'outline'|'ghost'} [props.variant='solid'] - Button variant
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Button size
 * @param {boolean} [props.loading] - Loading state
 * @param {React.ComponentType} [props.icon] - Icon component
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.disabled] - Disabled state
 * @param {object|string} [props.padding] - Responsive padding values
 * @param {React.ReactNode} props.children - Button content
 * 
 * @example
 * <ThemedButton variant="solid" size="md">
 *   Submit
 * </ThemedButton>
 * 
 * @example
 * <ThemedButton variant="outline" icon={Plus} loading={isLoading}>
 *   Add Item
 * </ThemedButton>
 * 
 * @example
 * <ThemedButton padding={{ mobile: 'sm', desktop: 'lg' }}>
 *   Responsive Button
 * </ThemedButton>
 * 
 * **Validates: Requirements 3.4, 3.8, 15.1, 15.5**
 */
export const ThemedButton = forwardRef(({
  variant = 'solid',
  size = 'md',
  loading,
  icon: Icon,
  className,
  disabled,
  padding,
  children,
  ...props
}, ref) => {
  const theme = useTheme();
  const { getResponsiveValue, isMobile } = useResponsive();
  
  const isDisabled = disabled || loading;
  
  // Get responsive size if padding is provided
  const responsiveSize = padding ? getResponsiveValue(padding) : size;
  
  // Size configurations
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[44px]',
    md: 'px-4 py-3 text-base min-h-[44px]',
    lg: 'px-6 py-4 text-lg min-h-[44px]',
  };
  
  /*
   * Variant styles — colour from the role-accent tokens (index.css, set by
   * `html[data-role]`), not from `theme.colors.primary` inline.
   *
   * The solid label was white on the role colour, which measured 2.86:1 on
   * player saffron, 2.28 on coach green and 2.03 on superadmin gold — the main
   * button of those portals failed WCAG 1.4.3. `on-accent` is near-black on the
   * bright dark-appearance fills (4.7–9.8:1) and white on the deeper light ones
   * (5.0–7.1:1). The fill itself is unchanged in dark.
   */
  const getVariantStyles = () => {
    const baseStyles = {
      solid: {
        className: clsx(
          'bg-accent text-on-accent font-medium',
          !isDisabled && 'hover:opacity-90',
        ),
      },
      outline: {
        className: clsx(
          'bg-transparent font-medium border-2 border-accent-fg text-accent-fg',
          !isDisabled && 'hover:bg-ink/5',
        ),
      },
      ghost: {
        className: clsx(
          'bg-transparent font-medium text-accent-fg',
          !isDisabled && 'hover:bg-ink/5',
        ),
      },
    };
    
    return baseStyles[variant] || baseStyles.solid;
  };
  
  const variantStyles = getVariantStyles();
  
  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      className={clsx(
        // Base styles
        'inline-flex items-center justify-center gap-2',
        'rounded-lg transition-all duration-200',
        
        // Size
        sizeClasses[responsiveSize],
        
        // Variant
        variantStyles.className,
        
        // Disabled state
        isDisabled && [
          'opacity-50',
          'cursor-not-allowed',
          'pointer-events-none',
        ],
        
        className
      )}
      whileHover={!isDisabled ? { scale: 1.02 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      whileFocus={{
        boxShadow: `0 0 0 3px ${theme.colors.primaryLight}`,
      }}
      {...props}
    >
      {/* Loading spinner */}
      {loading && (
        <Loader2 
          className={clsx(
            'animate-spin',
            responsiveSize === 'sm' && 'w-4 h-4',
            responsiveSize === 'md' && 'w-5 h-5',
            responsiveSize === 'lg' && 'w-6 h-6',
          )}
          aria-hidden="true"
        />
      )}
      
      {/* Icon */}
      {!loading && Icon && (
        <Icon 
          className={clsx(
            responsiveSize === 'sm' && 'w-4 h-4',
            responsiveSize === 'md' && 'w-5 h-5',
            responsiveSize === 'lg' && 'w-6 h-6',
          )}
          aria-hidden="true"
        />
      )}
      
      {/* Button text */}
      {children}
    </motion.button>
  );
});

ThemedButton.displayName = 'ThemedButton';

ThemedButton.propTypes = {
  variant: PropTypes.oneOf(['solid', 'outline', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  loading: PropTypes.bool,
  icon: PropTypes.elementType,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  padding: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      mobile: PropTypes.string,
      tablet: PropTypes.string,
      desktop: PropTypes.string,
    }),
  ]),
  children: PropTypes.node.isRequired,
};

ThemedButton.defaultProps = {
  variant: 'solid',
  size: 'md',
  loading: false,
  icon: null,
  className: '',
  disabled: false,
  padding: null,
};

export default ThemedButton;
