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

// Lazy load background decorations to reduce initial bundle size
export const HexGrid = lazy(() => import('./HexGrid'));
export const RadialBurst = lazy(() => import('./RadialBurst'));
export const DiagonalBurst = lazy(() => import('./DiagonalBurst'));
export const HexMesh = lazy(() => import('./HexMesh'));
export const Constellation = lazy(() => import('./Constellation'));
