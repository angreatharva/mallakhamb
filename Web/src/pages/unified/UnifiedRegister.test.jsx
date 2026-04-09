import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import UnifiedRegister from './UnifiedRegister';
import { ThemeProvider } from '../../components/design-system/theme/ThemeProvider';
import * as api from '../../services/api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../services/api');
vi.mock('../../utils/logger');
vi.mock('../../utils/secureStorage', () => ({
  secureStorage: { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Mock lazy-loaded ornaments so Suspense resolves immediately
vi.mock('../../components/design-system/ornaments', () => ({
  CoachOrnament: ({ color }) => <div data-testid="coach-ornament" style={{ color }} />,
  ShieldOrnament: ({ color }) => <div data-testid="shield-ornament" style={{ color }} />,
  GradientText: ({ children }) => <span data-testid="gradient-text">{children}</span>,
}));

// Mock framer-motion to render plain HTML elements (avoids animation issues in tests)
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, whileFocus, whileHover, whileTap, initial, animate, exit, transition, ...props }) => <div {...props}>{children}</div>,
    input: React.forwardRef(({ whileFocus, whileHover, whileTap, initial, animate, exit, transition, ...props }, ref) => (
      <input ref={ref} {...props} />
    )),
    button: ({ children, whileFocus, whileHover, whileTap, initial, animate, exit, transition, ...props }) => (
      <button {...props}>{children}</button>
    ),
    p: ({ children, whileFocus, whileHover, whileTap, initial, animate, exit, transition, ...props }) => (
      <p {...props}>{children}</p>
    ),
    select: React.forwardRef(({ children, whileFocus, whileHover, whileTap, initial, animate, exit, transition, ...props }, ref) => (
      <select ref={ref} {...props}>{children}</select>
    )),
  },
  AnimatePresence: ({ children }) => <>{children}</>,
  useReducedMotion: () => false,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), user: null, userType: null }),
}));

vi.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    getResponsiveValue: (v) => (typeof v === 'string' ? v : v.desktop ?? 'md'),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderAt = (route) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <React.Suspense fallback={<div>Loading...</div>}>
          <UnifiedRegister />
        </React.Suspense>
      </ThemeProvider>
    </MemoryRouter>
  );

// Use querySelector to avoid label-text ambiguity for password fields
const getPasswordInput = (container, role) =>
  container.querySelector(`#${role}-reg-password`);

const getConfirmPasswordInput = (container, role) =>
  container.querySelector(`#${role}-reg-confirmPassword`);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UnifiedRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  // ── Role detection ──────────────────────────────────────────────────────────

  describe('Role detection', () => {
    it('renders coach registration at /coach/register', async () => {
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByText(/coach registration/i)).toBeInTheDocument(), { timeout: 3000 });
    });

    it('renders player registration at /player/register', async () => {
      renderAt('/player/register');
      await waitFor(() => expect(screen.getByText(/player registration/i)).toBeInTheDocument(), { timeout: 3000 });
    });

    it('defaults to coach for unknown paths', async () => {
      renderAt('/unknown/register');
      await waitFor(() => expect(screen.getByText(/coach registration/i)).toBeInTheDocument());
    });
  });

  // ── Coach form fields ───────────────────────────────────────────────────────

  describe('Coach form fields', () => {
    it('shows name, email, phone, organization, password, confirm password', async () => {
      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
      expect(getPasswordInput(container, 'coach')).toBeInTheDocument();
      expect(getConfirmPasswordInput(container, 'coach')).toBeInTheDocument();
    });

    it('does NOT show date of birth or gender for coach', async () => {
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      expect(screen.queryByLabelText(/date of birth/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/gender/i)).not.toBeInTheDocument();
    });
  });

  // ── Player form fields ──────────────────────────────────────────────────────

  describe('Player form fields', () => {
    it('shows first name, last name, email, phone, dob, gender, password, confirm password', async () => {
      const { container } = renderAt('/player/register');
      await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
      expect(getPasswordInput(container, 'player')).toBeInTheDocument();
      expect(getConfirmPasswordInput(container, 'player')).toBeInTheDocument();
    });

    it('does NOT show organization for player', async () => {
      renderAt('/player/register');
      await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());
      expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument();
    });
  });

  // ── Form validation ─────────────────────────────────────────────────────────

  describe('Form validation', () => {
    it('shows required errors when submitting empty coach form', async () => {
      const user = userEvent.setup();
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Name is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Email is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Phone number is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Password is required'))).toBe(true);
      });
    });

    it('shows invalid email error', async () => {
      const user = userEvent.setup();
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/email address/i)).toBeInTheDocument());
      await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Invalid email'))).toBe(true);
      });
    });

    it('shows password too short error', async () => {
      const user = userEvent.setup();
      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(getPasswordInput(container, 'coach')).toBeInTheDocument());
      await user.type(getPasswordInput(container, 'coach'), '123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('at least 6 characters'))).toBe(true);
      });
    });

    it('shows passwords do not match error', async () => {
      const user = userEvent.setup();
      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(getPasswordInput(container, 'coach')).toBeInTheDocument());
      await user.type(getPasswordInput(container, 'coach'), 'password123');
      await user.type(getConfirmPasswordInput(container, 'coach'), 'different123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const passwordMismatchAlert = alerts.find(alert => alert.textContent.includes('Passwords do not match'));
        expect(passwordMismatchAlert).toBeInTheDocument();
      });
    });

    it('shows required errors when submitting empty player form', async () => {
      const user = userEvent.setup();
      renderAt('/player/register');
      await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        // Check for at least the main required fields
        expect(alerts.some(a => a.textContent.includes('First name is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Last name is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Email is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Date of birth is required'))).toBe(true);
      });
    });
  });

  // ── API integration ─────────────────────────────────────────────────────────

  describe('API integration', () => {
    it('calls coachAPI.register with form data on coach registration', async () => {
      const user = userEvent.setup();
      api.coachAPI = {
        register: vi.fn().mockResolvedValue({
          data: { token: 'coach-token', coach: { _id: '1', name: 'Test Coach' } },
        }),
      };

      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/full name/i), 'Test Coach');
      await user.type(screen.getByLabelText(/email address/i), 'coach@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '1234567890');
      await user.type(getPasswordInput(container, 'coach'), 'password123');
      await user.type(getConfirmPasswordInput(container, 'coach'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(api.coachAPI.register).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Test Coach', email: 'coach@test.com' })
        );
      });
    });

    it('calls playerAPI.register with form data on player registration', async () => {
      const user = userEvent.setup();
      api.playerAPI = {
        register: vi.fn().mockResolvedValue({
          data: { token: 'player-token', player: { _id: '2', firstName: 'Test' } },
        }),
      };

      const { container } = renderAt('/player/register');
      await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/first name/i), 'Test');
      await user.type(screen.getByLabelText(/last name/i), 'Player');
      await user.type(screen.getByLabelText(/email address/i), 'player@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '9876543210');
      await user.type(screen.getByLabelText(/date of birth/i), '2000-01-01');
      await user.selectOptions(screen.getByLabelText(/gender/i), 'Male');
      await user.type(getPasswordInput(container, 'player'), 'password123');
      await user.type(getConfirmPasswordInput(container, 'player'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(api.playerAPI.register).toHaveBeenCalledWith(
          expect.objectContaining({ firstName: 'Test', email: 'player@test.com' })
        );
      });
    });
  });

  // ── Navigation after registration ───────────────────────────────────────────

  describe('Post-registration navigation', () => {
    it('navigates coach to /coach/create-team after successful registration', async () => {
      const user = userEvent.setup();
      api.coachAPI = {
        register: vi.fn().mockResolvedValue({
          data: { token: 'tok', coach: { _id: '1', name: 'Coach' } },
        }),
      };

      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/full name/i), 'Coach');
      await user.type(screen.getByLabelText(/email address/i), 'c@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '1234567890');
      await user.type(getPasswordInput(container, 'coach'), 'pass123');
      await user.type(getConfirmPasswordInput(container, 'coach'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => expect(api.coachAPI.register).toHaveBeenCalled());
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/coach/create-team'), { timeout: 2000 });
    });

    it('navigates player to /player/select-team after successful registration', async () => {
      const user = userEvent.setup();
      api.playerAPI = {
        register: vi.fn().mockResolvedValue({
          data: { token: 'tok', player: { _id: '2', firstName: 'Player' } },
        }),
      };

      const { container } = renderAt('/player/register');
      await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/first name/i), 'Player');
      await user.type(screen.getByLabelText(/last name/i), 'One');
      await user.type(screen.getByLabelText(/email address/i), 'p@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '9876543210');
      await user.type(screen.getByLabelText(/date of birth/i), '2000-01-01');
      await user.selectOptions(screen.getByLabelText(/gender/i), 'Female');
      await user.type(getPasswordInput(container, 'player'), 'pass123');
      await user.type(getConfirmPasswordInput(container, 'player'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => expect(api.playerAPI.register).toHaveBeenCalled());
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/player/select-team'), { timeout: 2000 });
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('shows API error message on failed coach registration', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      api.coachAPI = {
        register: vi.fn().mockRejectedValue({
          response: { data: { message: 'Email already in use' } },
        }),
      };

      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/full name/i), 'Coach');
      await user.type(screen.getByLabelText(/email address/i), 'taken@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '1234567890');
      await user.type(getPasswordInput(container, 'coach'), 'pass123');
      await user.type(getConfirmPasswordInput(container, 'coach'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Email already in use');
      });
    });

    it('shows fallback error message when no API message provided', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      api.coachAPI = {
        register: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/full name/i), 'Coach');
      await user.type(screen.getByLabelText(/email address/i), 'c@test.com');
      await user.type(screen.getByLabelText(/phone number/i), '1234567890');
      await user.type(getPasswordInput(container, 'coach'), 'pass123');
      await user.type(getConfirmPasswordInput(container, 'coach'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Registration failed');
      });
    });
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('all form inputs have associated labels', async () => {
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('id');
      });
    });

    it('password toggle buttons have aria-labels', async () => {
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      // At least one password toggle should be present (password field)
      const toggles = screen.getAllByRole('button', { name: /show password|hide password/i });
      expect(toggles.length).toBeGreaterThanOrEqual(1);
    });

    it('error messages have role="alert"', async () => {
      const user = userEvent.setup();
      renderAt('/coach/register');
      await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });
    });

    it('form has accessible name', async () => {
      renderAt('/coach/register');
      await waitFor(() =>
        expect(screen.getByRole('form', { name: /coach registration form/i })).toBeInTheDocument()
      );
    });
  });

  // ── Password visibility toggle ──────────────────────────────────────────────

  describe('Password visibility toggle', () => {
    it('toggles password field visibility', async () => {
      const user = userEvent.setup();
      const { container } = renderAt('/coach/register');
      await waitFor(() => expect(getPasswordInput(container, 'coach')).toBeInTheDocument());
      const passwordInput = getPasswordInput(container, 'coach');
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleBtn = screen.getAllByRole('button', { name: /show password/i })[0];
      await user.click(toggleBtn);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(screen.getAllByRole('button', { name: /hide password/i })[0]);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });
});
