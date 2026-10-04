/**
 * Responsive Components Index
 * 
 * Exports all responsive layout components for easy importing
 * throughout the application.
 */

export {
  ResponsiveContainer,
  ResponsiveCenteredContainer,
  ResponsiveSectionContainer,
} from './ResponsiveContainer';

export {
  ResponsiveTable,
  ResponsiveScoringTable,
  ResponsiveTeamTable,
} from './ResponsiveTable';

export {
  ResponsiveIndividualRankings,
  ResponsiveTeamRankings,
  ResponsiveRankingsFilters,
} from './ResponsiveRankings';

export {
  ResponsiveFilters,
  ResponsiveTeamFilters,
  ResponsiveScoreFilters,
} from './ResponsiveFilters';

// Re-export responsive utilities for convenience
export {
  useResponsive,
  useMediaQuery,
  useBreakpoint,
  useResponsiveValue,
  useTouchTargetValidation,
} from '../../hooks/useResponsive';

export {
  BREAKPOINTS,
  RESPONSIVE_RANGES,
  BREAKPOINT_HELPERS,
  getViewportCategory,
  isBreakpoint,
  isMobile,
  isTablet,
  isDesktop,
  isDesktopBaseline,
  getResponsiveClasses,
  getResponsiveGrid,
  getResponsiveLayout,
  matchesBreakpoint,
  isTouchDevice,
  isHoverDevice,
} from '@/utils/ui/responsive';