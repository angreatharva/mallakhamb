import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Store original NODE_ENV
    originalEnv = process.env.NODE_ENV;
  });
  
  afterEach(() => {
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
  });
  
  describe('Inside ThemeProvider', () => {
    it('should return theme context when used inside ThemeProvider', () => {
      const TestComponent = () => {
        const theme = useTheme();
        return (
          <div>
            <div data-testid="has-theme">{theme ? 'yes' : 'no'}</div>
            <div data-testid="role">{theme.role}</div>
          </div>
        );
      };
      
      render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>
        </MemoryRouter>
      );
      
      expect(screen.getByTestId('has-theme')).toHaveTextContent('yes');
      expect(screen.getByTestId('role')).toHaveTextContent('admin');
    });
    
    it('should return all theme properties', () => {
      const TestComponent = () => {
        const theme = useTheme();
        return (
          <div>
            <div data-testid="has-colors">{theme.colors ? 'yes' : 'no'}</div>
            <div data-testid="has-spacing">{theme.spacing ? 'yes' : 'no'}</div>
            <div data-testid="has-typography">{theme.typography ? 'yes' : 'no'}</div>
            <div data-testid="has-radii">{theme.radii ? 'yes' : 'no'}</div>
            <div data-testid="has-shadows">{theme.shadows ? 'yes' : 'no'}</div>
          </div>
        );
      };
      
      render(
        <MemoryRouter>
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>
        </MemoryRouter>
      );
      
      expect(screen.getByTestId('has-colors')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-spacing')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-typography')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-radii')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-shadows')).toHaveTextContent('yes');
    });
  });
  
  describe('Outside ThemeProvider - Development Mode', () => {
    it('should throw error when used outside ThemeProvider in development', () => {
      // Set to development mode
      process.env.NODE_ENV = 'development';
      
      const TestComponent = () => {
        useTheme();
        return <div>Test</div>;
      };
      
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();
      
      expect(() => {
        render(
          <MemoryRouter>
            <TestComponent />
          </MemoryRouter>
        );
      }).toThrow('useTheme must be used within a ThemeProvider');
      
      // Restore console.error
      console.error = originalError;
    });
    
    it('should throw descriptive error message', () => {
      process.env.NODE_ENV = 'development';
      
      const TestComponent = () => {
        useTheme();
        return <div>Test</div>;
      };
      
      const originalError = console.error;
      console.error = vi.fn();
      
      expect(() => {
        render(
          <MemoryRouter>
            <TestComponent />
          </MemoryRouter>
        );
      }).toThrow(/Wrap your component tree with <ThemeProvider>/);
      
      console.error = originalError;
    });
  });
  
  describe('Outside ThemeProvider - Production Mode', () => {
    it('should return default theme when used outside ThemeProvider in production', () => {
      // Set to production mode
      process.env.NODE_ENV = 'production';
      
      const TestComponent = () => {
        const theme = useTheme();
        return (
          <div>
            <div data-testid="has-theme">{theme ? 'yes' : 'no'}</div>
            <div data-testid="role">{theme.role}</div>
            <div data-testid="has-colors">{theme.colors ? 'yes' : 'no'}</div>
          </div>
        );
      };
      
      render(
        <MemoryRouter>
          <TestComponent />
        </MemoryRouter>
      );
      
      expect(screen.getByTestId('has-theme')).toHaveTextContent('yes');
      expect(screen.getByTestId('role')).toHaveTextContent('public');
      expect(screen.getByTestId('has-colors')).toHaveTextContent('yes');
    });
    
    it('should return default theme with all required properties', () => {
      process.env.NODE_ENV = 'production';
      
      const TestComponent = () => {
        const theme = useTheme();
        return (
          <div>
            <div data-testid="primary">{theme.colors.primary}</div>
            <div data-testid="spacing">{theme.spacing.md}</div>
            <div data-testid="font-size">{theme.typography.fontSize.base}</div>
          </div>
        );
      };
      
      render(
        <MemoryRouter>
          <TestComponent />
        </MemoryRouter>
      );
      
      // Should have valid values
      expect(screen.getByTestId('primary').textContent).toBeTruthy();
      expect(screen.getByTestId('spacing').textContent).toBeTruthy();
      expect(screen.getByTestId('font-size').textContent).toBeTruthy();
    });
  });
  
  describe('Multiple Components', () => {
    it('should provide consistent theme to multiple components', () => {
      const Component1 = () => {
        const theme = useTheme();
        return <div data-testid="comp1-role">{theme.role}</div>;
      };
      
      const Component2 = () => {
        const theme = useTheme();
        return <div data-testid="comp2-role">{theme.role}</div>;
      };
      
      render(
        <MemoryRouter initialEntries={['/coach/teams']}>
          <ThemeProvider>
            <Component1 />
            <Component2 />
          </ThemeProvider>
        </MemoryRouter>
      );
      
      expect(screen.getByTestId('comp1-role')).toHaveTextContent('coach');
      expect(screen.getByTestId('comp2-role')).toHaveTextContent('coach');
    });
  });
});
