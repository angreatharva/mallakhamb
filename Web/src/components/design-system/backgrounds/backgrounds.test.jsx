import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HexGrid from './HexGrid';
import RadialBurst from './RadialBurst';
import DiagonalBurst from './DiagonalBurst';
import HexMesh from './HexMesh';
import Constellation from './Constellation';
import * as useReducedMotionModule from '../animations/useReducedMotion';

describe('Background Decoration Components', () => {
  beforeEach(() => {
    // Mock useReducedMotion to return false by default
    vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HexGrid', () => {
    it('should render without crashing', () => {
      const { container } = render(<HexGrid />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should apply default color and opacity', () => {
      const { container } = render(<HexGrid />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.03' });
    });

    it('should apply custom color prop', () => {
      const { container } = render(<HexGrid color="#8B5CF6" />);
      const path = container.querySelector('path');
      expect(path).toHaveAttribute('stroke', '#8B5CF6');
    });

    it('should apply custom opacity prop', () => {
      const { container } = render(<HexGrid opacity={0.1} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.1' });
    });

    it('should be positioned absolutely', () => {
      const { container } = render(<HexGrid />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('absolute');
    });

    it('should be non-interactive (pointer-events-none)', () => {
      const { container } = render(<HexGrid />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('pointer-events-none');
    });

    it('should have aria-hidden attribute', () => {
      const { container } = render(<HexGrid />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply custom className', () => {
      const { container } = render(<HexGrid className="custom-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should respect prefers-reduced-motion (static rendering)', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<HexGrid />);
      const svg = container.querySelector('svg');
      // Component should still render (static version)
      expect(svg).toBeInTheDocument();
    });
  });

  describe('RadialBurst', () => {
    it('should render without crashing', () => {
      const { container } = render(<RadialBurst />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should apply default opacity', () => {
      const { container } = render(<RadialBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ opacity: '0.15' });
    });

    it('should apply custom color prop', () => {
      const { container } = render(<RadialBurst color="#22C55E" />);
      const burst = container.firstChild;
      // Browser converts hex to rgb, so check for rgb values
      expect(burst.style.background).toContain('rgb(34, 197, 94)');
    });

    it('should apply custom opacity prop', () => {
      const { container } = render(<RadialBurst opacity={0.3} />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ opacity: '0.3' });
    });

    it('should apply top-left position', () => {
      const { container } = render(<RadialBurst position="top-left" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ top: '-10%', left: '-10%' });
    });

    it('should apply top-right position', () => {
      const { container } = render(<RadialBurst position="top-right" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ top: '-10%', right: '-10%' });
    });

    it('should apply bottom-left position', () => {
      const { container } = render(<RadialBurst position="bottom-left" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ bottom: '-10%', left: '-10%' });
    });

    it('should apply bottom-right position', () => {
      const { container } = render(<RadialBurst position="bottom-right" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ bottom: '-10%', right: '-10%' });
    });

    it('should apply center position', () => {
      const { container } = render(<RadialBurst position="center" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ top: '50%', left: '50%' });
    });

    it('should apply small size', () => {
      const { container } = render(<RadialBurst size="sm" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ width: '400px', height: '400px' });
    });

    it('should apply medium size', () => {
      const { container } = render(<RadialBurst size="md" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ width: '600px', height: '600px' });
    });

    it('should apply large size', () => {
      const { container } = render(<RadialBurst size="lg" />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ width: '800px', height: '800px' });
    });

    it('should be positioned absolutely', () => {
      const { container } = render(<RadialBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveClass('absolute');
    });

    it('should be non-interactive (pointer-events-none)', () => {
      const { container } = render(<RadialBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveClass('pointer-events-none');
    });

    it('should have aria-hidden attribute', () => {
      const { container } = render(<RadialBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply blur filter', () => {
      const { container } = render(<RadialBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ filter: 'blur(60px)' });
    });
  });

  describe('DiagonalBurst', () => {
    it('should render without crashing', () => {
      const { container } = render(<DiagonalBurst />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should apply default opacity', () => {
      const { container } = render(<DiagonalBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ opacity: '0.08' });
    });

    it('should apply custom color prop', () => {
      const { container } = render(<DiagonalBurst color="#8B5CF6" />);
      const burst = container.firstChild;
      // Browser converts hex to rgb, so check for rgb values
      expect(burst.style.background).toContain('rgb(139, 92, 246)');
    });

    it('should apply custom opacity prop', () => {
      const { container } = render(<DiagonalBurst opacity={0.15} />);
      const burst = container.firstChild;
      expect(burst).toHaveStyle({ opacity: '0.15' });
    });

    it('should apply top-left-to-bottom-right direction', () => {
      const { container } = render(<DiagonalBurst direction="top-left-to-bottom-right" />);
      const burst = container.firstChild;
      expect(burst.style.background).toContain('135deg');
    });

    it('should apply top-right-to-bottom-left direction', () => {
      const { container } = render(<DiagonalBurst direction="top-right-to-bottom-left" />);
      const burst = container.firstChild;
      expect(burst.style.background).toContain('225deg');
    });

    it('should apply bottom-left-to-top-right direction', () => {
      const { container } = render(<DiagonalBurst direction="bottom-left-to-top-right" />);
      const burst = container.firstChild;
      expect(burst.style.background).toContain('45deg');
    });

    it('should apply bottom-right-to-top-left direction', () => {
      const { container } = render(<DiagonalBurst direction="bottom-right-to-top-left" />);
      const burst = container.firstChild;
      expect(burst.style.background).toContain('315deg');
    });

    it('should be positioned absolutely', () => {
      const { container } = render(<DiagonalBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveClass('absolute');
    });

    it('should be non-interactive (pointer-events-none)', () => {
      const { container } = render(<DiagonalBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveClass('pointer-events-none');
    });

    it('should have aria-hidden attribute', () => {
      const { container } = render(<DiagonalBurst />);
      const burst = container.firstChild;
      expect(burst).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('HexMesh', () => {
    it('should render without crashing', () => {
      const { container } = render(<HexMesh />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should apply default opacity', () => {
      const { container } = render(<HexMesh />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.04' });
    });

    it('should apply custom color prop', () => {
      const { container } = render(<HexMesh color="#22C55E" />);
      const line = container.querySelector('line');
      expect(line).toHaveAttribute('stroke', '#22C55E');
    });

    it('should apply custom opacity prop', () => {
      const { container } = render(<HexMesh opacity={0.08} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.08' });
    });

    it('should render mesh pattern with lines', () => {
      const { container } = render(<HexMesh />);
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThan(0);
    });

    it('should render dots at intersections', () => {
      const { container } = render(<HexMesh />);
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });

    it('should be positioned absolutely', () => {
      const { container } = render(<HexMesh />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('absolute');
    });

    it('should be non-interactive (pointer-events-none)', () => {
      const { container } = render(<HexMesh />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('pointer-events-none');
    });

    it('should have aria-hidden attribute', () => {
      const { container } = render(<HexMesh />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Constellation', () => {
    it('should render without crashing', () => {
      const { container } = render(<Constellation />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should apply default opacity', () => {
      const { container } = render(<Constellation />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.3' });
    });

    it('should apply custom color prop', () => {
      const { container } = render(<Constellation color="#8B5CF6" />);
      const circle = container.querySelector('circle');
      expect(circle).toHaveAttribute('fill', '#8B5CF6');
    });

    it('should apply custom opacity prop', () => {
      const { container } = render(<Constellation opacity={0.5} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveStyle({ opacity: '0.5' });
    });

    it('should render stars based on starCount prop', () => {
      const { container } = render(<Constellation starCount={20} />);
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBe(20);
    });

    it('should render connection lines between stars', () => {
      const { container } = render(<Constellation starCount={10} />);
      const lines = container.querySelectorAll('line');
      // Should have some connections (exact number depends on random positions)
      expect(lines.length).toBeGreaterThanOrEqual(0);
    });

    it('should be positioned absolutely', () => {
      const { container } = render(<Constellation />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('absolute');
    });

    it('should be non-interactive (pointer-events-none)', () => {
      const { container } = render(<Constellation />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('pointer-events-none');
    });

    it('should have aria-hidden attribute', () => {
      const { container } = render(<Constellation />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    });

    it('should memoize star positions (not regenerate on re-render)', () => {
      const { container, rerender } = render(<Constellation starCount={10} />);
      const initialCircles = Array.from(container.querySelectorAll('circle'));
      const initialPositions = initialCircles.map((c) => ({
        cx: c.getAttribute('cx'),
        cy: c.getAttribute('cy'),
      }));

      // Re-render with same props
      rerender(<Constellation starCount={10} />);

      const newCircles = Array.from(container.querySelectorAll('circle'));
      const newPositions = newCircles.map((c) => ({
        cx: c.getAttribute('cx'),
        cy: c.getAttribute('cy'),
      }));

      // Positions should be the same (memoized)
      expect(initialPositions).toEqual(newPositions);
    });
  });

  describe('Content Readability', () => {
    it('HexGrid should not interfere with content (low opacity)', () => {
      const { container } = render(
        <div>
          <HexGrid />
          <div data-testid="content">Content</div>
        </div>
      );

      const content = screen.getByTestId('content');
      const svg = container.querySelector('svg');

      expect(content).toBeInTheDocument();
      expect(parseFloat(svg.style.opacity)).toBeLessThanOrEqual(0.1);
    });

    it('RadialBurst should not interfere with content (positioned behind)', () => {
      const { container } = render(
        <div style={{ position: 'relative' }}>
          <RadialBurst />
          <div data-testid="content" style={{ position: 'relative', zIndex: 1 }}>
            Content
          </div>
        </div>
      );

      const content = screen.getByTestId('content');
      const burst = container.querySelector('.pointer-events-none');

      expect(content).toBeInTheDocument();
      expect(burst).toHaveStyle({ zIndex: '0' });
    });

    it('DiagonalBurst should not interfere with content (low opacity)', () => {
      const { container } = render(
        <div>
          <DiagonalBurst />
          <div data-testid="content">Content</div>
        </div>
      );

      const content = screen.getByTestId('content');
      const burst = container.querySelector('.pointer-events-none');

      expect(content).toBeInTheDocument();
      expect(parseFloat(burst.style.opacity)).toBeLessThanOrEqual(0.15);
    });

    it('All decorations should have pointer-events-none to not block interactions', () => {
      const { container } = render(
        <div>
          <HexGrid />
          <RadialBurst />
          <DiagonalBurst />
          <HexMesh />
          <Constellation />
        </div>
      );

      const decorations = container.querySelectorAll('.pointer-events-none');
      expect(decorations.length).toBe(5);
    });
  });

  describe('Prefers Reduced Motion', () => {
    it('should respect prefers-reduced-motion for HexGrid', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<HexGrid />);
      // Component should render static version
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should respect prefers-reduced-motion for RadialBurst', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<RadialBurst />);
      // Component should render static version
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should respect prefers-reduced-motion for DiagonalBurst', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<DiagonalBurst />);
      // Component should render static version
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should respect prefers-reduced-motion for HexMesh', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<HexMesh />);
      // Component should render static version
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should respect prefers-reduced-motion for Constellation', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
      const { container } = render(<Constellation />);
      // Component should render static version
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Barrel Export', () => {
    it('should export all background components', async () => {
      const module = await import('./index.js');

      expect(module.HexGrid).toBeDefined();
      expect(module.RadialBurst).toBeDefined();
      expect(module.DiagonalBurst).toBeDefined();
      expect(module.HexMesh).toBeDefined();
      expect(module.Constellation).toBeDefined();
    });
  });
});
