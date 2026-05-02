import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import AccountLockoutMessage from './AccountLockoutMessage';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...props }) => <div {...props}>{children}</div>,
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AccountLockoutMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Component rendering ─────────────────────────────────────────────────────

  describe('Component rendering', () => {
    it('renders lockout message with countdown timer', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      expect(screen.getByText(/too many failed login attempts/i)).toBeInTheDocument();
    });

    it('displays countdown in MM:SS format', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      // Should show 15:00 initially
      expect(screen.getByText(/15:00/)).toBeInTheDocument();
    });

    it('renders with custom primary color', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      const customColor = '#FF0000';
      
      const { container } = render(
        <AccountLockoutMessage lockoutEndTime={lockoutEndTime} primaryColor={customColor} />
      );
      
      const lockoutDiv = container.querySelector('.lockout-message');
      expect(lockoutDiv).toBeInTheDocument();
    });

    it('renders AlertCircle icon', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { container } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      const icon = container.querySelector('.icon');
      expect(icon).toBeInTheDocument();
    });
  });

  // ── Countdown timer functionality ───────────────────────────────────────────

  describe('Countdown timer functionality', () => {
    it('updates countdown every second', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const lockoutEndTime = new Date(Date.now() + 3 * 1000); // 3 seconds from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      // Initial state - should show around 3 seconds
      expect(screen.getByText(/0:0[23]/)).toBeInTheDocument();
      
      // Wait for countdown to update
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Should show around 1-2 seconds
      expect(screen.getByText(/0:0[12]/)).toBeInTheDocument();
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('pads seconds with leading zero', async () => {
      const lockoutEndTime = new Date(Date.now() + 65 * 1000); // 1 minute 5 seconds
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/1:05/)).toBeInTheDocument();
    });

    it('handles minutes correctly', async () => {
      const lockoutEndTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/10:00/)).toBeInTheDocument();
    });

    it('displays "Account unlocked" when timer expires', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const lockoutEndTime = new Date(Date.now() + 1500); // 1.5 seconds from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      
      // Wait for lockout to expire
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await waitFor(() => {
        expect(screen.getByText(/account unlocked/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('changes message when unlocked', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const lockoutEndTime = new Date(Date.now() + 1000); // 1 second from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/too many failed login attempts/i)).toBeInTheDocument();
      
      // Wait for lockout to expire
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await waitFor(() => {
        expect(screen.getByText(/you can now try logging in again/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('stops updating after timer expires', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const lockoutEndTime = new Date(Date.now() + 1000); // 1 second from now
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      // Wait for lockout to expire
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await waitFor(() => {
        expect(screen.getByText(/account unlocked/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Wait more time - should not change
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(screen.getByText(/account unlocked/i)).toBeInTheDocument();
      
      vi.useFakeTimers(); // Restore fake timers
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles lockout time in the past', () => {
      const lockoutEndTime = new Date(Date.now() - 1000); // 1 second ago
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/account unlocked/i)).toBeInTheDocument();
    });

    it('handles very short lockout periods', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const lockoutEndTime = new Date(Date.now() + 500); // 0.5 seconds
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/0:00/)).toBeInTheDocument();
      
      await new Promise(resolve => setTimeout(resolve, 700));
      
      await waitFor(() => {
        expect(screen.getByText(/account unlocked/i)).toBeInTheDocument();
      }, { timeout: 2000 });
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('handles long lockout periods', () => {
      const lockoutEndTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(screen.getByText(/60:00/)).toBeInTheDocument();
    });

    it('cleans up interval on unmount', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { unmount } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      unmount();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('icon has aria-hidden attribute', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { container } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      const icon = container.querySelector('.icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('uses semantic HTML structure', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { container } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      expect(container.querySelector('.title')).toBeInTheDocument();
      expect(container.querySelector('.description')).toBeInTheDocument();
    });
  });

  // ── Visual styling ──────────────────────────────────────────────────────────

  describe('Visual styling', () => {
    it('applies correct background and border styles', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      const primaryColor = '#FF6B6B';
      
      const { container } = render(
        <AccountLockoutMessage lockoutEndTime={lockoutEndTime} primaryColor={primaryColor} />
      );
      
      const lockoutDiv = container.querySelector('.lockout-message');
      expect(lockoutDiv).toBeInTheDocument();
    });

    it('uses default primary color when not provided', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { container } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      const lockoutDiv = container.querySelector('.lockout-message');
      expect(lockoutDiv).toBeInTheDocument();
    });

    it('applies monospace font to countdown timer', () => {
      const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000);
      
      const { container } = render(<AccountLockoutMessage lockoutEndTime={lockoutEndTime} />);
      
      const timerSpan = container.querySelector('.font-mono');
      expect(timerSpan).toBeInTheDocument();
      expect(timerSpan).toHaveTextContent(/15:00/);
    });
  });
});
