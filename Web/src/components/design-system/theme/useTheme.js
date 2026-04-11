import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import { DESIGN_TOKENS, getRoleColor } from '../../../styles/tokens';

/**
 * Default theme configuration for production fallback
 */
const DEFAULT_THEME = {
  role: 'public',
  colors: {
    primary: getRoleColor('public'),
    primaryLight: 'rgba(59, 130, 246, 0.15)',
    primaryDark: 'rgba(59, 130, 246, 0.9)',
    background: DESIGN_TOKENS.colors.surfaces.dark,
    card: DESIGN_TOKENS.colors.surfaces.darkCard,
    border: DESIGN_TOKENS.colors.borders.subtle,
    borderBright: DESIGN_TOKENS.colors.borders.bright,
  },
  spacing: DESIGN_TOKENS.spacing,
  typography: DESIGN_TOKENS.typography,
  radii: DESIGN_TOKENS.radii,
  shadows: DESIGN_TOKENS.shadows,
};

/**
 * useTheme - Hook to access theme context values
 *
 * @returns {object} Theme configuration object with role, colors, spacing, typography, etc.
 * @throws {Error} In development mode if used outside ThemeProvider
 *
 * @example
 * const MyComponent = () => {
 *   const theme = useTheme();
 *
 *   return (
 *     <div style={{ color: theme.colors.primary }}>
 *       Themed content for {theme.role}
 *     </div>
 *   );
 * };
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  const nodeEnv = globalThis?.process?.env?.NODE_ENV;
  const isDev = nodeEnv ? nodeEnv !== 'production' : import.meta.env.DEV;

  // In development, throw descriptive error if used outside ThemeProvider
  if (!context && isDev) {
    throw new Error(
      'useTheme must be used within a ThemeProvider. ' +
        'Wrap your component tree with <ThemeProvider> to provide theme context.'
    );
  }

  // In production, return default theme if context is missing (graceful degradation)
  return context || DEFAULT_THEME;
};

export default useTheme;
