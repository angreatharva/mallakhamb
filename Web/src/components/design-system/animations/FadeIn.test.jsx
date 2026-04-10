import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { FadeIn } from './FadeIn';
import * as useReducedMotionModule from './useReducedMotion';

describe('FadeIn', () => {
  let mockIntersectionObserver;
  let observerCallback;
  let observedElements;

  beforeEach(() => {
    observedElements = new Set();

    // Mock IntersectionObserver as a proper constructor
    mockIntersectionObserver = vi.fn(function (callback) {
      observerCallback = callback;
      this.observe = vi.fn((element) => {
        observedElements.add(element);
      });
      this.unobserve = vi.fn((element) => {
        observedElements.delete(element);
      });
      this.disconnect = vi.fn();
    });

    global.IntersectionObserver = mockIntersectionObserver;

    // Mock useReducedMotion to return false by default
    vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    observedElements.clear();
  });

  describe('Rendering', () => {
    it('should render children', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test Content</div>
        </FadeIn>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByTestId('child')).toHaveTextContent('Test Content');
    });

    it('should apply custom className', () => {
      render(
        <FadeIn className="custom-class">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Reduced Motion Support', () => {
    it('should show content immediately when reduced motion is preferred', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);

      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ opacity: '1' });
    });

    it('should not apply transform when reduced motion is preferred', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);

      render(
        <FadeIn direction="up">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transform: 'translate(0, 0)' });
    });

    it('should not apply transition when reduced motion is preferred', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);

      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transition: 'none' });
    });

    it('should respect reduced motion for all directions', () => {
      vi.spyOn(useReducedMotionModule, 'useReducedMotion').mockReturnValue(true);

      const directions = ['up', 'down', 'left', 'right'];

      directions.forEach((direction) => {
        const { unmount } = render(
          <FadeIn direction={direction}>
            <div data-testid={`child-${direction}`}>Test</div>
          </FadeIn>
        );

        const wrapper = screen.getByTestId(`child-${direction}`).parentElement;
        expect(wrapper).toHaveStyle({ transform: 'translate(0, 0)' });

        unmount();
      });
    });
  });

  describe('Animation Behavior', () => {
    it('should start with opacity 0 when motion is allowed', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ opacity: '0' });
    });

    it('should apply correct transform for "up" direction', () => {
      render(
        <FadeIn direction="up">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transform: 'translate(0, 20px)' });
    });

    it('should apply correct transform for "down" direction', () => {
      render(
        <FadeIn direction="down">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transform: 'translate(0, -20px)' });
    });

    it('should apply correct transform for "left" direction', () => {
      render(
        <FadeIn direction="left">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transform: 'translate(20px, 0)' });
    });

    it('should apply correct transform for "right" direction', () => {
      render(
        <FadeIn direction="right">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      expect(wrapper).toHaveStyle({ transform: 'translate(-20px, 0)' });
    });

    it('should apply delay to transition', () => {
      render(
        <FadeIn delay={500}>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      const transition = wrapper.style.transition;
      expect(transition).toContain('500ms');
    });

    it('should use default delay of 0 when not specified', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      const transition = wrapper.style.transition;
      expect(transition).toContain('0ms');
    });
  });

  describe('Intersection Observer Integration', () => {
    it('should create IntersectionObserver when motion is allowed', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should observe the element', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      expect(observedElements.size).toBe(1);
    });

    it('should configure IntersectionObserver with correct options', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          threshold: 0.1,
          rootMargin: '50px',
        })
      );
    });

    it('should animate when element enters viewport', async () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;

      // Initially hidden
      expect(wrapper).toHaveStyle({ opacity: '0' });

      // Simulate element entering viewport
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper).toHaveStyle({ opacity: '1' });
      });
    });

    it('should not animate when element is not intersecting', () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;

      // Simulate element not intersecting
      observerCallback([
        {
          isIntersecting: false,
          target: wrapper,
        },
      ]);

      expect(wrapper).toHaveStyle({ opacity: '0' });
    });

    it('should unobserve element on unmount', () => {
      const unobserveMock = vi.fn();
      mockIntersectionObserver = vi.fn(function (callback) {
        observerCallback = callback;
        this.observe = vi.fn();
        this.unobserve = unobserveMock;
        this.disconnect = vi.fn();
      });

      global.IntersectionObserver = mockIntersectionObserver;

      const { unmount } = render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      unmount();

      expect(unobserveMock).toHaveBeenCalled();
    });
  });

  describe('Idempotence - Animation Runs Once', () => {
    it('should animate only once when element enters viewport', async () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;

      // First intersection - should animate
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper).toHaveStyle({ opacity: '1' });
      });

      // Reset opacity to test if it animates again
      wrapper.style.opacity = '0';

      // Second intersection - should NOT animate again
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      // Opacity should remain 0 (not animated again)
      expect(wrapper).toHaveStyle({ opacity: '0' });
    });

    it('should not animate again after leaving and re-entering viewport', async () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;

      // Enter viewport - animate
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper).toHaveStyle({ opacity: '1' });
      });

      // Leave viewport
      act(() => {
        observerCallback([
          {
            isIntersecting: false,
            target: wrapper,
          },
        ]);
      });

      // Reset opacity to test
      wrapper.style.opacity = '0';

      // Re-enter viewport - should NOT animate again
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      expect(wrapper).toHaveStyle({ opacity: '0' });
    });

    it('should maintain animated state across multiple intersection events', async () => {
      render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;

      // Animate once
      act(() => {
        observerCallback([
          {
            isIntersecting: true,
            target: wrapper,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper).toHaveStyle({ opacity: '1' });
      });

      // Multiple subsequent intersections
      act(() => {
        for (let i = 0; i < 5; i++) {
          observerCallback([
            {
              isIntersecting: true,
              target: wrapper,
            },
          ]);
        }
      });

      // Should still be visible (animated only once)
      expect(wrapper).toHaveStyle({ opacity: '1' });
    });
  });

  describe('Multiple FadeIn Components', () => {
    it('should animate each component independently', async () => {
      // Create separate observers for each component
      let observer1Callback;
      let observer2Callback;
      let callCount = 0;

      mockIntersectionObserver = vi.fn(function (callback) {
        if (callCount === 0) {
          observer1Callback = callback;
        } else {
          observer2Callback = callback;
        }
        callCount++;

        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
      });

      global.IntersectionObserver = mockIntersectionObserver;

      render(
        <div>
          <FadeIn>
            <div data-testid="child1">First</div>
          </FadeIn>
          <FadeIn>
            <div data-testid="child2">Second</div>
          </FadeIn>
        </div>
      );

      const wrapper1 = screen.getByTestId('child1').parentElement;
      const wrapper2 = screen.getByTestId('child2').parentElement;

      // Both should start hidden
      expect(wrapper1).toHaveStyle({ opacity: '0' });
      expect(wrapper2).toHaveStyle({ opacity: '0' });

      // Animate first component
      act(() => {
        observer1Callback([
          {
            isIntersecting: true,
            target: wrapper1,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper1).toHaveStyle({ opacity: '1' });
      });

      // Second component should still be hidden
      expect(wrapper2).toHaveStyle({ opacity: '0' });

      // Animate second component
      act(() => {
        observer2Callback([
          {
            isIntersecting: true,
            target: wrapper2,
          },
        ]);
      });

      await waitFor(() => {
        expect(wrapper2).toHaveStyle({ opacity: '1' });
      });
    });

    it('should apply different delays to multiple components', () => {
      render(
        <div>
          <FadeIn delay={100}>
            <div data-testid="child1">First</div>
          </FadeIn>
          <FadeIn delay={300}>
            <div data-testid="child2">Second</div>
          </FadeIn>
        </div>
      );

      const wrapper1 = screen.getByTestId('child1').parentElement;
      const wrapper2 = screen.getByTestId('child2').parentElement;

      expect(wrapper1.style.transition).toContain('100ms');
      expect(wrapper2.style.transition).toContain('300ms');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing element ref gracefully', () => {
      const { unmount } = render(
        <FadeIn>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      expect(() => unmount()).not.toThrow();
    });

    it('should handle default direction when invalid direction is provided', () => {
      render(
        <FadeIn direction="invalid">
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      // Should default to 'up' direction
      expect(wrapper).toHaveStyle({ transform: 'translate(0, 20px)' });
    });

    it('should handle negative delay values', () => {
      render(
        <FadeIn delay={-100}>
          <div data-testid="child">Test</div>
        </FadeIn>
      );

      const wrapper = screen.getByTestId('child').parentElement;
      // Should still apply the delay value (browser will handle negative values)
      expect(wrapper.style.transition).toContain('-100ms');
    });
  });
});
