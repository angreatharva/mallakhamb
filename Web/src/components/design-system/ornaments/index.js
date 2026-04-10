/**
 * Ornaments - Decorative components for role-specific pages
 *
 * This module exports ornament components used in login pages,
 * dashboards, and other role-specific interfaces.
 *
 * Components are lazy-loaded to optimize bundle size.
 *
 * **Validates: Requirements 10.2, 10.4**
 */

import { lazy } from 'react';

// Lazy load ornaments to reduce initial bundle size
export const ShieldOrnament = lazy(() => import('./ShieldOrnament'));
export const CoachOrnament = lazy(() => import('./CoachOrnament'));
export const GradientText = lazy(() => import('./GradientText'));
