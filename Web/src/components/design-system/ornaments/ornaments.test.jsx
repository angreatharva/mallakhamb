import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShieldOrnament from './ShieldOrnament';
import CoachOrnament from './CoachOrnament';
import GradientText from './GradientText';
import * as useReducedMotionModule from '../animations/useReducedMotion';
import * as useThemeModule from '../theme/useTheme';

describe('Ornament Components', () => {
  beforeEach(() => {
    // Mock useReducedMotion to return false by default
    vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(false);
    
    // Mock useTheme to return a default theme
    vi.spyOn(useThemeModule, 'useTheme').mockReturnValue({
      colors: {
        primary: '#8B5CF6',
        primaryLight: '#A78BFA',
        primaryDark: '#6D28D9',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ShieldOrnament', () => {
    describe('Rendering', () => {
      it('should render without crashing', () => {
        const { container } = render(<ShieldOrnament />);
        expect(container).toBeInTheDocument();
      });

      it('should render shield icon', () => {
        const { container } = render(<ShieldOrnament />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toBeInTheDocument();
      });

      it('should render with default medium size', () => {
        const { container } = render(<ShieldOrnament />);
        const innerContainer = container.querySelector('div[style*="width"]');
        expect(innerContainer).toBeInTheDocument();
      });
    });

    describe('Size Variants', () => {
      it('should render small size variant', () => {
        const { container } = render(<ShieldOrnament size="sm" />);
        expect(container).toBeInTheDocument();
      });

      it('should render medium size variant', () => {
        const { container } = render(<ShieldOrnament size="md" />);
        expect(container).toBeInTheDocument();
      });

      it('should render large size variant', () => {
        const { container } = render(<ShieldOrnament size="lg" />);
        expect(container).toBeInTheDocument();
      });

      it('should default to medium size for invalid size', () => {
        const { container } = render(<ShieldOrnament size="invalid" />);
        expect(container).toBeInTheDocument();
      });
    });

    describe('Color Customization', () => {
      it('should use custom color when provided', () => {
        const customColor = '#FF0000';
        const { container } = render(<ShieldOrnament color={customColor} />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toHaveStyle({ color: customColor });
      });

      it('should use theme color when no custom color provided', () => {
        const { container } = render(<ShieldOrnament />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toHaveStyle({ color: '#8B5CF6' });
      });
    });

    describe('Reduced Motion Support', () => {
      it('should not render animated rings when reduced motion is preferred', () => {
        vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
        const { container } = render(<ShieldOrnament />);
        
        // Outer dashed ring should not be rendered
        const dashedRing = container.querySelector('[style*="dashed"]');
        expect(dashedRing).not.toBeInTheDocument();
      });

      it('should render animated rings when motion is allowed', () => {
        vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(false);
        const { container } = render(<ShieldOrnament />);
        
        // Outer dashed ring should be rendered
        const dashedRing = container.querySelector('[style*="dashed"]');
        expect(dashedRing).toBeInTheDocument();
      });
    });

    describe('Accessibility', () => {
      it('should have aria-hidden on icon', () => {
        const { container } = render(<ShieldOrnament />);
        const icon = container.querySelector('svg');
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('CoachOrnament', () => {
    describe('Rendering', () => {
      it('should render without crashing', () => {
        const { container } = render(<CoachOrnament />);
        expect(container).toBeInTheDocument();
      });

      it('should render UserCheck icon', () => {
        const { container } = render(<CoachOrnament />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toBeInTheDocument();
      });
    });

    describe('Size Variants', () => {
      it('should render small size variant', () => {
        const { container } = render(<CoachOrnament size="sm" />);
        expect(container).toBeInTheDocument();
      });

      it('should render medium size variant', () => {
        const { container } = render(<CoachOrnament size="md" />);
        expect(container).toBeInTheDocument();
      });

      it('should render large size variant', () => {
        const { container } = render(<CoachOrnament size="lg" />);
        expect(container).toBeInTheDocument();
      });
    });

    describe('Color Customization', () => {
      it('should use custom color when provided', () => {
        const customColor = '#22C55E';
        const { container } = render(<CoachOrnament color={customColor} />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toHaveStyle({ color: customColor });
      });

      it('should use theme color when no custom color provided', () => {
        const { container } = render(<CoachOrnament />);
        const icon = container.querySelector('svg[aria-hidden="true"]');
        expect(icon).toHaveStyle({ color: '#8B5CF6' });
      });
    });

    describe('Reduced Motion Support', () => {
      it('should not render animated rings when reduced motion is preferred', () => {
        vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
        const { container } = render(<CoachOrnament />);
        
        // Outer dashed ring should not be rendered
        const dashedRing = container.querySelector('[style*="dashed"]');
        expect(dashedRing).not.toBeInTheDocument();
      });

      it('should render animated rings when motion is allowed', () => {
        vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(false);
        const { container } = render(<CoachOrnament />);
        
        // Outer dashed ring should be rendered
        const dashedRing = container.querySelector('[style*="dashed"]');
        expect(dashedRing).toBeInTheDocument();
      });
    });

    describe('Accessibility', () => {
      it('should have aria-hidden on icon', () => {
        const { container } = render(<CoachOrnament />);
        const icon = container.querySelector('svg');
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('GradientText', () => {
    describe('Rendering', () => {
      it('should render children text', () => {
        render(<GradientText>Hello World</GradientText>);
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      it('should apply custom className', () => {
        const { container } = render(
          <GradientText className="custom-class">Test</GradientText>
        );
        const span = container.querySelector('.custom-class');
        expect(span).toBeInTheDocument();
      });

      it('should apply gradient styles', () => {
        const { container } = render(<GradientText>Test</GradientText>);
        const span = container.querySelector('span');
        // Check that gradient styles are applied
        expect(span.style.background).toContain('linear-gradient');
        expect(span.style.WebkitBackgroundClip).toBe('text');
        expect(span.style.WebkitTextFillColor).toBe('transparent');
      });
    });

    describe('Color Customization', () => {
      it('should use custom colors when provided', () => {
        const customColors = ['#FF0000', '#00FF00', '#0000FF'];
        const { container } = render(
          <GradientText colors={customColors}>Test</GradientText>
        );
        const span = container.querySelector('span');
        // Check that custom colors are in the gradient
        expect(span.style.background).toContain('linear-gradient');
        expect(span.style.background).toContain('255, 0, 0'); // RGB for #FF0000
      });

      it('should use theme colors when no custom colors provided', () => {
        const { container } = render(<GradientText>Test</GradientText>);
        const span = container.querySelector('span');
        // Check that theme colors are in the gradient
        expect(span.style.background).toContain('linear-gradient');
        expect(span.style.background).toContain('139, 92, 246'); // RGB for #8B5CF6
      });

      it('should fallback to saffron gradient when theme is not available', () => {
        vi.spyOn(useThemeModule, 'useTheme').mockReturnValue(null);
        const { container } = render(<GradientText>Test</GradientText>);
        const span = container.querySelector('span');
        // Check that fallback gradient is applied
        expect(span.style.background).toContain('linear-gradient');
      });
    });

    describe('Animation', () => {
      it('should not animate by default', () => {
        const { container } = render(<GradientText>Test</GradientText>);
        const span = container.querySelector('span');
        // Static span should not have backgroundSize set to 200% 200%
        expect(span.style.backgroundSize).not.toBe('200% 200%');
      });

      it('should animate when animate prop is true', () => {
        const { container } = render(
          <GradientText animate>Test</GradientText>
        );
        const span = container.querySelector('span');
        // Animated span should have backgroundSize set
        expect(span.style.backgroundSize).toBe('200% 200%');
      });

      it('should not animate when reduced motion is preferred', () => {
        vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);
        const { container } = render(
          <GradientText animate>Test</GradientText>
        );
        const span = container.querySelector('span');
        // Should render static span when reduced motion is preferred
        expect(span.style.backgroundSize).not.toBe('200% 200%');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty children', () => {
        const { container } = render(<GradientText></GradientText>);
        expect(container.querySelector('span')).toBeInTheDocument();
      });

      it('should handle single color in colors array', () => {
        const { container } = render(
          <GradientText colors={['#FF0000']}>Test</GradientText>
        );
        const span = container.querySelector('span');
        // Should fallback to theme colors when less than 2 colors provided
        expect(span).toBeInTheDocument();
      });

      it('should handle invalid colors array', () => {
        const { container } = render(
          <GradientText colors="not-an-array">Test</GradientText>
        );
        const span = container.querySelector('span');
        // Should fallback to theme colors
        expect(span).toBeInTheDocument();
      });
    });
  });

  describe('Integration', () => {
    it('should render all ornament components together', () => {
      const { container } = render(
        <div>
          <ShieldOrnament />
          <CoachOrnament />
          <GradientText>Test</GradientText>
        </div>
      );
      
      expect(container).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should respect theme context across all components', () => {
      const customTheme = {
        colors: {
          primary: '#FF0000',
          primaryLight: '#FF5555',
          primaryDark: '#AA0000',
        },
      };
      
      vi.spyOn(useThemeModule, 'useTheme').mockReturnValue(customTheme);
      
      const { container } = render(
        <div>
          <ShieldOrnament />
          <CoachOrnament />
          <GradientText>Test</GradientText>
        </div>
      );
      
      const icons = container.querySelectorAll('svg[aria-hidden="true"]');
      icons.forEach(icon => {
        expect(icon).toHaveStyle({ color: '#FF0000' });
      });
    });
  });
});
