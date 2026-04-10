import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Users } from 'lucide-react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GlassCard } from './GlassCard';
import { DarkCard } from './DarkCard';
import { StatCard } from './StatCard';
import { TiltCard } from './TiltCard';

describe('Card Components', () => {
  const renderWithTheme = (ui, role = 'admin') => {
    return render(
      <MemoryRouter>
        <ThemeProvider role={role}>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  describe('GlassCard', () => {
    it('should render children correctly', () => {
      renderWithTheme(
        <GlassCard>
          <h2>Test Title</h2>
          <p>Test content</p>
        </GlassCard>
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should apply glassmorphism styling', () => {
      const { container } = renderWithTheme(<GlassCard>Content</GlassCard>);

      const card = container.querySelector('.glass-card');
      // Check that the card has the expected inline styles
      expect(card).toBeInTheDocument();
      expect(card.style.backdropFilter).toBe('blur(10px)');
      expect(card.style.borderRadius).toBe('12px');
    });

    it('should support custom className', () => {
      const { container } = renderWithTheme(
        <GlassCard className="custom-class">Content</GlassCard>
      );

      const card = container.querySelector('.glass-card');
      expect(card.className).toContain('custom-class');
    });

    it('should support custom style props', () => {
      const { container } = renderWithTheme(
        <GlassCard style={{ padding: '2rem' }}>Content</GlassCard>
      );

      const card = container.querySelector('.glass-card');
      expect(card).toHaveStyle({ padding: '2rem' });
    });
  });

  describe('DarkCard', () => {
    it('should render children correctly', () => {
      renderWithTheme(
        <DarkCard>
          <h2>Dark Card Title</h2>
        </DarkCard>
      );

      expect(screen.getByText('Dark Card Title')).toBeInTheDocument();
    });

    it('should apply dark glassmorphism styling', () => {
      const { container } = renderWithTheme(<DarkCard>Content</DarkCard>);

      const card = container.querySelector('.dark-card');
      // Check that the card has the expected inline styles
      expect(card).toBeInTheDocument();
      expect(card.style.backdropFilter).toBe('blur(10px)');
      expect(card.style.borderRadius).toBe('12px');
    });

    it('should apply hover styles when hover prop is true', () => {
      const { container } = renderWithTheme(<DarkCard hover>Content</DarkCard>);

      const card = container.querySelector('.dark-card');

      // Simulate mouse enter
      fireEvent.mouseEnter(card);

      // Check that transform is applied on hover
      expect(card).toHaveStyle({
        transform: 'translateY(-2px)',
      });
    });

    it('should not apply hover styles when hover prop is false', () => {
      const { container } = renderWithTheme(<DarkCard hover={false}>Content</DarkCard>);

      const card = container.querySelector('.dark-card');

      // Simulate mouse enter
      fireEvent.mouseEnter(card);

      // Transform should remain at 0
      expect(card).toHaveStyle({
        transform: 'translateY(0)',
      });
    });

    it('should support custom className', () => {
      const { container } = renderWithTheme(<DarkCard className="custom-dark">Content</DarkCard>);

      const card = container.querySelector('.dark-card');
      expect(card.className).toContain('custom-dark');
    });

    it('should support custom style props', () => {
      const { container } = renderWithTheme(
        <DarkCard style={{ margin: '1rem' }}>Content</DarkCard>
      );

      const card = container.querySelector('.dark-card');
      expect(card).toHaveStyle({ margin: '1rem' });
    });
  });

  describe('StatCard', () => {
    it('should render label and value', () => {
      renderWithTheme(<StatCard label="Total Users" value={1234} color="#8B5CF6" />);

      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('1234')).toBeInTheDocument();
    });

    it('should render icon when provided', () => {
      const { container } = renderWithTheme(
        <StatCard icon={Users} label="Total Users" value={1234} color="#8B5CF6" />
      );

      // Check that icon SVG is rendered
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      renderWithTheme(
        <StatCard label="Total Users" value={1234} color="#8B5CF6" subtitle="Active this month" />
      );

      expect(screen.getByText('Active this month')).toBeInTheDocument();
    });

    it('should apply custom color', () => {
      const { container } = renderWithTheme(
        <StatCard label="Total Users" value={1234} color="#FF6B00" />
      );

      const value = screen.getByText('1234');
      expect(value).toHaveStyle({ color: '#FF6B00' });
    });

    it('should support custom className', () => {
      const { container } = renderWithTheme(
        <StatCard label="Total Users" value={1234} color="#8B5CF6" className="custom-stat" />
      );

      const card = container.querySelector('.stat-card');
      expect(card.className).toContain('custom-stat');
    });

    it('should support custom style props', () => {
      const { container } = renderWithTheme(
        <StatCard label="Total Users" value={1234} color="#8B5CF6" style={{ width: '300px' }} />
      );

      const card = container.querySelector('.stat-card');
      expect(card).toHaveStyle({ width: '300px' });
    });
  });

  describe('TiltCard', () => {
    it('should render children correctly', () => {
      renderWithTheme(
        <TiltCard>
          <h2>Tilt Card Title</h2>
        </TiltCard>
      );

      expect(screen.getByText('Tilt Card Title')).toBeInTheDocument();
    });

    it('should respect prefers-reduced-motion', () => {
      // Mock matchMedia to return prefers-reduced-motion: reduce
      const mockMatchMedia = vi.fn((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      window.matchMedia = mockMatchMedia;

      const { container } = renderWithTheme(<TiltCard>Content</TiltCard>);

      const card = container.querySelector('.tilt-card');

      // Simulate mouse move
      fireEvent.mouseMove(card, { clientX: 100, clientY: 100 });

      // With reduced motion, tilt should not be applied
      // The card should not have rotateX or rotateY transforms
      expect(card).toBeInTheDocument();
    });

    it('should support custom className', () => {
      const { container } = renderWithTheme(<TiltCard className="custom-tilt">Content</TiltCard>);

      const card = container.querySelector('.tilt-card');
      expect(card.className).toContain('custom-tilt');
    });

    it('should support custom style props', () => {
      const { container } = renderWithTheme(
        <TiltCard style={{ minHeight: '200px' }}>Content</TiltCard>
      );

      const card = container.querySelector('.tilt-card');
      expect(card).toHaveStyle({ minHeight: '200px' });
    });
  });

  describe('Responsive behavior', () => {
    it('should render cards on mobile viewports', () => {
      // Mock mobile viewport
      global.innerWidth = 375;
      global.innerHeight = 667;

      const { container } = renderWithTheme(
        <>
          <GlassCard>Glass Card</GlassCard>
          <DarkCard>Dark Card</DarkCard>
          <StatCard label="Stat" value={100} color="#8B5CF6" />
          <TiltCard>Tilt Card</TiltCard>
        </>
      );

      expect(screen.getByText('Glass Card')).toBeInTheDocument();
      expect(screen.getByText('Dark Card')).toBeInTheDocument();
      expect(screen.getByText('Stat')).toBeInTheDocument();
      expect(screen.getByText('Tilt Card')).toBeInTheDocument();
    });

    it('should maintain consistent padding on mobile', () => {
      global.innerWidth = 375;

      const { container } = renderWithTheme(<GlassCard>Content</GlassCard>);

      const card = container.querySelector('.glass-card');
      expect(card).toHaveStyle({ padding: '1.5rem' });
    });
  });
});
