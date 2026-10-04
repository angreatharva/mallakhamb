/**
 * Background Decorations
 * 
 * Reusable background decoration components for visual effects.
 * All components are positioned absolutely, non-interactive, and respect prefers-reduced-motion.
 * 
 * Components are lazy-loaded to optimize bundle size.
 * 
 * **Validates: Requirements 10.2, 10.4**
 */

import { lazy } from 'react';

/*
 * NOT lazy, unlike the decorations below it. AmbientOrbs renders in the first
 * paint of almost every page, so a Suspense boundary around it would show a
 * hole where the background belongs; it is also small enough that deferring it
 * buys nothing.
 */
export { default as AmbientOrbs, ORB_INTENSITY } from './AmbientOrbs';

// Lazy, to keep it out of the pages that never draw it.
export const HexGrid = lazy(() => import('./HexGrid'));
