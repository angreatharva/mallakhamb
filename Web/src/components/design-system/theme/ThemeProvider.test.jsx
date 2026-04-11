import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';
import { DESIGN_TOKENS } from '../../../styles/tokens';

// Test component that uses the theme
const ThemeConsumer = () => {
  const theme = useTheme();
  return (
    <div>
      <div data-testid="role">{theme.role}</div>
      <div data-testid="primary-color">{theme.colors.primary}</div>
      <div data-testid="background-color">{theme.colors.background}</div>
    </div>
  );
};

describe('ThemeProvider', () => {
  describe('Role Detection from Route Path', () => {
    it('should detect admin role from /admin path', () => {
      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('admin');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#8B5CF6');
    });

    it('should detect superadmin role from /superadmin path', () => {
      render(
        <MemoryRouter initialEntries={['/superadmin/overview']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('superadmin');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#F5A623');
    });

    it('should detect coach role from /coach path', () => {
      render(
        <MemoryRouter initialEntries={['/coach/teams']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('coach');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#22C55E');
    });

    it('should detect player role from /player path', () => {
      render(
        <MemoryRouter initialEntries={['/player/dashboard']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('player');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#FF6B00');
    });

    it('should detect judge role from /judge path', () => {
      render(
        <MemoryRouter initialEntries={['/judge/scoring']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('judge');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#8B5CF6');
    });

    it('should default to public role for unknown paths', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('public');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#3B82F6');
    });

    it('should default to public role for unrecognized paths', () => {
      render(
        <MemoryRouter initialEntries={['/unknown/path']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('public');
    });
  });

  describe('Manual Role Override', () => {
    it('should use manual role override instead of route detection', () => {
      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <ThemeProvider role="coach">
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      // Should use coach theme even though route is /admin
      expect(screen.getByTestId('role')).toHaveTextContent('coach');
      expect(screen.getByTestId('primary-color')).toHaveTextContent('#22C55E');
    });

    it('should accept all valid role values', () => {
      const roles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public'];

      roles.forEach((role) => {
        const { unmount } = render(
          <MemoryRouter>
            <ThemeProvider role={role}>
              <ThemeConsumer />
            </ThemeProvider>
          </MemoryRouter>
        );

        expect(screen.getByTestId('role')).toHaveTextContent(role);
        unmount();
      });
    });
  });

  describe('Theme Configuration', () => {
    it('should provide correct theme structure', () => {
      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <ThemeProvider>
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      // Check that background color is provided
      expect(screen.getByTestId('background-color')).toHaveTextContent(
        DESIGN_TOKENS.colors.surfaces.dark
      );
    });

    it('should provide spacing tokens', () => {
      const SpacingConsumer = () => {
        const theme = useTheme();
        return <div data-testid="spacing">{theme.spacing.md}</div>;
      };

      render(
        <MemoryRouter>
          <ThemeProvider>
            <SpacingConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('spacing')).toHaveTextContent(DESIGN_TOKENS.spacing.md);
    });

    it('should provide typography tokens', () => {
      const TypographyConsumer = () => {
        const theme = useTheme();
        return <div data-testid="font-size">{theme.typography.fontSize.base}</div>;
      };

      render(
        <MemoryRouter>
          <ThemeProvider>
            <TypographyConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('font-size')).toHaveTextContent(
        DESIGN_TOKENS.typography.fontSize.base
      );
    });
  });

  describe('Theme Changes', () => {
    it('should update theme when manual role prop changes', () => {
      const { rerender } = render(
        <MemoryRouter>
          <ThemeProvider role="admin">
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('admin');

      // Change role prop
      rerender(
        <MemoryRouter>
          <ThemeProvider role="coach">
            <ThemeConsumer />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('role')).toHaveTextContent('coach');
    });
  });

  describe('Nested Components', () => {
    it('should provide theme to deeply nested components', () => {
      const DeepComponent = () => {
        const theme = useTheme();
        return <div data-testid="deep-role">{theme.role}</div>;
      };

      const MiddleComponent = () => (
        <div>
          <DeepComponent />
        </div>
      );

      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <ThemeProvider>
            <MiddleComponent />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('deep-role')).toHaveTextContent('admin');
    });

    it('should provide same theme to multiple sibling components', () => {
      const Sibling1 = () => {
        const theme = useTheme();
        return <div data-testid="sibling1">{theme.role}</div>;
      };

      const Sibling2 = () => {
        const theme = useTheme();
        return <div data-testid="sibling2">{theme.colors.primary}</div>;
      };

      render(
        <MemoryRouter initialEntries={['/coach/teams']}>
          <ThemeProvider>
            <Sibling1 />
            <Sibling2 />
          </ThemeProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('sibling1')).toHaveTextContent('coach');
      expect(screen.getByTestId('sibling2')).toHaveTextContent('#22C55E');
    });
  });
});
