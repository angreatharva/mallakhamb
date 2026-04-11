/**
 * Visual Regression Tests for Design System Components
 *
 * These tests create snapshots of themed components to ensure visual consistency
 * across refactoring and updates. They validate that components render correctly
 * with different themes and props.
 *
 * Requirements: 12.4 - Visual regression tests for themed components
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { ThemedButton } from './forms/ThemedButton';
import { ThemedInput } from './forms/ThemedInput';
import { ThemedSelect } from './forms/ThemedSelect';
import { DarkCard } from './cards/DarkCard';
import { GlassCard } from './cards/GlassCard';
import { StatCard } from './cards/StatCard';
import { Users } from 'lucide-react';

// Helper to render with theme
const renderWithTheme = (component, role = 'admin') => {
  return render(
    <BrowserRouter>
      <ThemeProvider role={role}>{component}</ThemeProvider>
    </BrowserRouter>
  );
};

describe('Visual Regression Tests', () => {
  describe('ThemedButton Snapshots', () => {
    it('should match snapshot for solid variant with admin theme', () => {
      const { container } = renderWithTheme(
        <ThemedButton variant="solid">Click Me</ThemedButton>,
        'admin'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for outline variant with coach theme', () => {
      const { container } = renderWithTheme(
        <ThemedButton variant="outline">Click Me</ThemedButton>,
        'coach'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for ghost variant with player theme', () => {
      const { container } = renderWithTheme(
        <ThemedButton variant="ghost">Click Me</ThemedButton>,
        'player'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for loading state', () => {
      const { container } = renderWithTheme(<ThemedButton loading>Loading</ThemedButton>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for disabled state', () => {
      const { container } = renderWithTheme(<ThemedButton disabled>Disabled</ThemedButton>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('ThemedInput Snapshots', () => {
    it('should match snapshot for default input with admin theme', () => {
      const { container } = renderWithTheme(<ThemedInput placeholder="Enter text" />, 'admin');
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for input with icon', () => {
      const { container } = renderWithTheme(<ThemedInput icon={Users} placeholder="Enter text" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for input with error', () => {
      const { container } = renderWithTheme(
        <ThemedInput error="This field is required" placeholder="Enter text" />
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for disabled input', () => {
      const { container } = renderWithTheme(<ThemedInput disabled placeholder="Enter text" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('ThemedSelect Snapshots', () => {
    const options = [
      { value: '1', label: 'Option 1' },
      { value: '2', label: 'Option 2' },
      { value: '3', label: 'Option 3' },
    ];

    it('should match snapshot for default select with admin theme', () => {
      const { container } = renderWithTheme(
        <ThemedSelect options={options} placeholder="Select option" />,
        'admin'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for select with coach theme', () => {
      const { container } = renderWithTheme(
        <ThemedSelect options={options} placeholder="Select option" />,
        'coach'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for disabled select', () => {
      const { container } = renderWithTheme(
        <ThemedSelect options={options} disabled placeholder="Select option" />
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Card Component Snapshots', () => {
    it('should match snapshot for DarkCard with admin theme', () => {
      const { container } = renderWithTheme(
        <DarkCard>
          <h3>Card Title</h3>
          <p>Card content goes here</p>
        </DarkCard>,
        'admin'
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for GlassCard', () => {
      const { container } = renderWithTheme(
        <GlassCard>
          <h3>Glass Card</h3>
          <p>Glassmorphism effect</p>
        </GlassCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot for StatCard', () => {
      const { container } = renderWithTheme(
        <StatCard icon={Users} label="Total Users" value={150} color="#8B5CF6" />
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Theme Variations', () => {
    const roles = ['admin', 'superadmin', 'coach', 'player', 'judge'];

    roles.forEach((role) => {
      it(`should match snapshot for ThemedButton with ${role} theme`, () => {
        const { container } = renderWithTheme(
          <ThemedButton variant="solid">Button</ThemedButton>,
          role
        );
        expect(container.firstChild).toMatchSnapshot();
      });

      it(`should match snapshot for DarkCard with ${role} theme`, () => {
        const { container } = renderWithTheme(<DarkCard>Card Content</DarkCard>, role);
        expect(container.firstChild).toMatchSnapshot();
      });
    });
  });
});
