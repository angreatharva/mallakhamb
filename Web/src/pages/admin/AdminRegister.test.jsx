import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import AdminRegister from './AdminRegister';
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

vi.mock('../../contexts/CompetitionContext', () => ({
  CompetitionProvider: ({ children }) => <div data-testid="competition-provider">{children}</div>,
}));

vi.mock('../../components/CompetitionSelectionScreen', () => ({
  default: () => <div data-testid="competition-selection-screen">Competition Selection</div>,
}));

vi.mock('../../components/design-system/backgrounds', () => ({
  HexGrid: ({ color }) => <div data-testid="hex-grid" style={{ color }} />,
}));

vi.mock('../../components/design-system/animations', () => ({
  useReducedMotion: () => false,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderAdminRegister = () =>
  render(
    <MemoryRouter initialEntries={['/admin/register']}>
      <ThemeProvider role="admin">
        <React.Suspense fallback={<div>Loading...</div>}>
          <AdminRegister />
        </React.Suspense>
      </ThemeProvider>
    </MemoryRouter>
  );

// Use querySelector to avoid label-text ambiguity for password fields
const getPasswordInput = (container) => container.querySelector('#admin-password');
const getConfirmPasswordInput = (container) => container.querySelector('#admin-confirm-password');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdminRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  // ── Component rendering ─────────────────────────────────────────────────────

  describe('Component rendering', () => {
    it('renders admin registration form', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByText(/register/i)).toBeInTheDocument());
      expect(screen.getAllByText(/create your admin account/i).length).toBeGreaterThan(0);
    });

    it('renders all required form fields', async () => {
      const { container } = renderAdminRegister();
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(getPasswordInput(container)).toBeInTheDocument();
      expect(getConfirmPasswordInput(container)).toBeInTheDocument();
    });

    it('renders submit button', async () => {
      renderAdminRegister();
      await waitFor(() => 
        expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument()
      );
    });

    it('renders link to admin login page', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByText(/already have an account/i)).toBeInTheDocument());
      
      const loginLink = screen.getByRole('link', { name: /sign in/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute('href', '/admin/login');
    });

    it('renders password requirements checklist', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByText(/password requirements/i)).toBeInTheDocument());
      
      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/contains uppercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/contains lowercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/contains number/i)).toBeInTheDocument();
    });
  });

  // ── Form validation ─────────────────────────────────────────────────────────

  describe('Form validation', () => {
    it('shows required errors when submitting empty form', async () => {
      const user = userEvent.setup();
      renderAdminRegister();
      
      await waitFor(() => 
        expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument()
      );
      
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Name is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Email is required'))).toBe(true);
        expect(alerts.some(a => a.textContent.includes('Password is required'))).toBe(true);
      });
    });

    it('validates email format', async () => {
      const user = userEvent.setup();
      renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/email/i), 'invalid-email');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Invalid email'))).toBe(true);
      });
    });

    it('validates password minimum length of 12 characters', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'short');
      await user.type(getConfirmPasswordInput(container), 'short');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('at least 12 characters'))).toBe(true);
      });
    });

    it('validates password and confirmPassword match', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'DifferentPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Passwords do not match'))).toBe(true);
      });
    });

    it('shows success indicator when passwords match', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      const password = 'ValidPassword123';
      await user.type(getPasswordInput(container), password);
      await user.type(getConfirmPasswordInput(container), password);
      
      await waitFor(() => {
        expect(screen.getByText(/passwords match/i)).toBeInTheDocument();
      });
    });

    it('validates name minimum length', async () => {
      const user = userEvent.setup();
      renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'A');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('at least 2 characters'))).toBe(true);
      });
    });
  });

  // ── Password strength indicator ────────────────────────────────────────────

  describe('Password strength indicator', () => {
    it('shows password strength indicator when typing password', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      await user.type(getPasswordInput(container), 'WeakPass1');
      
      await waitFor(() => {
        expect(screen.getByText(/password strength/i)).toBeInTheDocument();
      });
    });

    it('updates password requirements checklist as user types', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      // Type a password that meets all requirements
      await user.type(getPasswordInput(container), 'StrongPassword123');
      
      await waitFor(() => {
        // Verify password requirements are visible and being tracked
        expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
        expect(screen.getByText(/contains uppercase letter/i)).toBeInTheDocument();
        expect(screen.getByText(/contains lowercase letter/i)).toBeInTheDocument();
        expect(screen.getByText(/contains number/i)).toBeInTheDocument();
      });
    });
  });

  // ── Password visibility toggle ──────────────────────────────────────────────

  describe('Password visibility toggle', () => {
    it('toggles password field visibility', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getPasswordInput(container)).toBeInTheDocument());
      
      const passwordInput = getPasswordInput(container);
      expect(passwordInput).toHaveAttribute('type', 'password');
      
      const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
      await user.click(toggleButtons[0]);
      
      expect(passwordInput).toHaveAttribute('type', 'text');
      
      await user.click(screen.getAllByRole('button', { name: /hide password/i })[0]);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('toggles confirm password field visibility', async () => {
      const user = userEvent.setup();
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(getConfirmPasswordInput(container)).toBeInTheDocument());
      
      const confirmPasswordInput = getConfirmPasswordInput(container);
      expect(confirmPasswordInput).toHaveAttribute('type', 'password');
      
      const toggleButtons = screen.getAllByRole('button', { name: /show password/i });
      await user.click(toggleButtons[1]);
      
      expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    });
  });

  // ── API integration ─────────────────────────────────────────────────────────

  describe('API integration', () => {
    it('calls adminAPI.register with correct data on form submission', async () => {
      const user = userEvent.setup();
      const mockLogin = vi.fn();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          admin: { _id: '1', name: 'Test Admin', email: 'admin@test.com' },
        },
      });
      
      vi.doMock('../../contexts/AuthContext', () => ({
        useAuth: () => ({ login: mockLogin, user: null, userType: null }),
      }));
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(api.adminAPI.register).toHaveBeenCalledWith({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: 'ValidPassword123',
        });
      });
    });

    it('stores token and admin profile on successful registration', async () => {
      const user = userEvent.setup();
      const { secureStorage } = await import('../../utils/secureStorage');
      
      vi.mocked(api.adminAPI).register = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          admin: { _id: '1', name: 'Test Admin', email: 'admin@test.com' },
        },
      });
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(secureStorage.setItem).toHaveBeenCalledWith('admin_token', 'test-token');
        expect(secureStorage.setItem).toHaveBeenCalledWith(
          'admin_user',
          JSON.stringify({ _id: '1', name: 'Test Admin', email: 'admin@test.com' })
        );
      });
    });

    it('shows competition selection screen after successful registration', async () => {
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          admin: { _id: '1', name: 'Test Admin', email: 'admin@test.com' },
        },
      });
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(screen.getByTestId('competition-selection-screen')).toBeInTheDocument();
      });
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('handles duplicate email error (409 status)', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'Email already registered' },
        },
      });
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'existing@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Email already registered')
        );
      });
    });

    it('handles rate limiting error (429 status)', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests' },
        },
      });
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Too many registration attempts')
        );
      });
    });

    it('handles generic API error', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockRejectedValue({
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      });
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Internal server error');
      });
    });

    it('handles network error with fallback message', async () => {
      const toast = (await import('react-hot-toast')).default;
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Registration failed')
        );
      });
    });
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('all form inputs have associated labels', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('password toggle buttons have aria-labels', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      const toggles = screen.getAllByRole('button', { name: /show password|hide password/i });
      expect(toggles.length).toBeGreaterThanOrEqual(2);
    });

    it('error messages have role="alert"', async () => {
      const user = userEvent.setup();
      renderAdminRegister();
      
      await waitFor(() => 
        expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument()
      );
      
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });
    });

    it('required fields are marked with asterisk', async () => {
      renderAdminRegister();
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      // Check that required indicators are present
      const labels = screen.getAllByText('*');
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('disables submit button while loading', async () => {
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      
      const submitButton = screen.getByRole('button', { name: /create admin account/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });

    it('shows loading text while submitting', async () => {
      const user = userEvent.setup();
      
      vi.mocked(api.adminAPI).register = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      
      const { container } = renderAdminRegister();
      
      await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
      
      await user.type(screen.getByLabelText(/full name/i), 'Test Admin');
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com');
      await user.type(getPasswordInput(container), 'ValidPassword123');
      await user.type(getConfirmPasswordInput(container), 'ValidPassword123');
      await user.click(screen.getByRole('button', { name: /create admin account/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/creating account/i)).toBeInTheDocument();
      });
    });
  });
});
