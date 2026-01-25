/**
 * Responsive Components Index
 * 
 * Exports all responsive layout components for easy importing
 * throughout the application.
 */

export {
  ResponsiveContainer,
  ResponsiveCenteredContainer,
  ResponsiveFullWidthContainer,
  ResponsiveSectionContainer,
  ResponsiveFormContainer,
} from './ResponsiveContainer';

export {
  ResponsiveGrid,
  ResponsiveCardGrid,
  ResponsiveFormGrid,
  ResponsiveAutoGrid,
  ResponsiveMasonryGrid,
  ResponsiveDashboardGrid,
  ResponsiveTableGrid,
} from './ResponsiveGrid';

export {
  ResponsiveForm,
  ResponsiveFormField,
  ResponsiveInput,
  ResponsiveSelect,
  ResponsiveButton,
  ResponsivePasswordInput,
  ResponsiveFormGrid as ResponsiveFormGridLayout,
} from './ResponsiveForm';

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

export {
  ResponsiveImage,
  ResponsiveHeroImage,
  ResponsiveCardImage,
  ResponsiveGalleryImage,
} from './ResponsiveImage';

export {
  ResponsiveHeading,
  ResponsiveHeroText,
  ResponsiveText,
  ResponsiveLabel,
  ResponsiveCaption,
  ResponsiveLink,
  ResponsiveNavText,
  ResponsiveButtonText,
  ResponsiveCardTitle,
  ResponsiveCardDescription,
  ResponsiveStatNumber,
  ResponsiveStatLabel,
} from './ResponsiveTypography';

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
} from '../../utils/responsive';