import { useState, useEffect } from 'react';

/**
 * useReducedMotion - Hook that detects user's motion preference
 *
 * Checks the prefers-reduced-motion media query and listens for changes.
 * Returns true if the user prefers reduced motion, false otherwise.
 *
 * @returns {boolean} True if user prefers reduced motion
 *
 * @example
 * const shouldReduceMotion = useReducedMotion();
 *
 * <motion.div
 *   animate={shouldReduceMotion ? {} : { scale: [1, 1.05, 1] }}
 * />
 */
export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined' || !window.matchMedia) return false;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
  });

  useEffect(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Handler for media query changes
    const handleChange = (event) => {
      setPrefersReducedMotion(event.matches);
    };

    // Listen for changes to user preference
    mediaQuery.addEventListener('change', handleChange);

    // Cleanup listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
};

export default useReducedMotion;
