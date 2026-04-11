import { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * FadeIn - Animation component that fades in content when it enters the viewport
 *
 * Uses Intersection Observer for scroll-triggered animations.
 * Respects prefers-reduced-motion setting.
 * Animation runs once per element (idempotent).
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to animate
 * @param {number} props.delay - Delay before animation starts (in ms)
 * @param {'up'|'down'|'left'|'right'} props.direction - Direction of fade animation
 * @param {string} props.className - Additional CSS classes
 *
 * @example
 * <FadeIn delay={200} direction="up">
 *   <h1>Welcome</h1>
 * </FadeIn>
 */
export const FadeIn = ({ children, delay = 0, direction = 'up', className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // If reduced motion is preferred or already animated, show immediately
    if (shouldReduceMotion || hasAnimated) {
      setIsVisible(true);
      return;
    }

    // Create Intersection Observer for scroll-triggered animation
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setIsVisible(true);
            setHasAnimated(true); // Ensure animation runs only once
          }
        });
      },
      {
        threshold: 0.1, // Trigger when 10% of element is visible
        rootMargin: '50px', // Start animation slightly before element enters viewport
      }
    );

    observer.observe(element);

    // Cleanup observer on unmount
    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [shouldReduceMotion, hasAnimated]);

  // Calculate transform based on direction
  const getTransform = () => {
    if (shouldReduceMotion || isVisible) return 'translate(0, 0)';

    switch (direction) {
      case 'up':
        return 'translate(0, 20px)';
      case 'down':
        return 'translate(0, -20px)';
      case 'left':
        return 'translate(20px, 0)';
      case 'right':
        return 'translate(-20px, 0)';
      default:
        return 'translate(0, 20px)';
    }
  };

  // Base styles for animation
  const baseStyles = {
    opacity: shouldReduceMotion ? 1 : isVisible ? 1 : 0,
    transform: getTransform(),
    transition: shouldReduceMotion
      ? 'none'
      : `opacity 0.6s ease-out ${delay}ms, transform 0.6s ease-out ${delay}ms`,
  };

  return (
    <div ref={elementRef} style={baseStyles} className={className}>
      {children}
    </div>
  );
};

export default FadeIn;
