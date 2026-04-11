/**
 * Animation Utilities and Components
 *
 * Centralized animation utilities for the design system.
 * All animations respect prefers-reduced-motion setting.
 */

// Hooks
export { useReducedMotion } from './useReducedMotion';

// Components
export { FadeIn } from './FadeIn';

// Animation easing constants
export const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';
export const EASE_SPRING = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)';

// Animation duration constants (in ms)
export const DURATION = {
  fast: 200,
  normal: 300,
  slow: 500,
};

// Common animation configurations
export const ANIMATION_CONFIG = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3, ease: EASE_OUT },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: EASE_OUT },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: EASE_OUT },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: EASE_SPRING },
  },
};
