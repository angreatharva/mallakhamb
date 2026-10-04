/**
 * useReducedMotion — true when the person has asked for less motion.
 *
 * ONE implementation, in hooks/useResponsive.js; this path re-exports it so the
 * design-system imports keep working. There were two copies (and a third
 * re-export from Home.jsx) that behaved the same today and could only drift.
 *
 * @example
 * const shouldReduceMotion = useReducedMotion();
 * <motion.div animate={shouldReduceMotion ? {} : { scale: [1, 1.05, 1] }} />
 */
export { useReducedMotion } from '../../../hooks/useResponsive';
export { useReducedMotion as default } from '../../../hooks/useResponsive';
