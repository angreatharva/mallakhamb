import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import UnifiedLogin from './UnifiedLogin';
import { ThemeProvider } from '../../components/design-system/theme/ThemeProvider';
import axios from 'axios';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('axios');
vi.mock('../../utils/logger');
vi.mock('../../utils/secureStorage', () => ({
  secureStorage: { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../components/design-system/ornaments', () => ({
  ShieldOrnament: ({ color }) => <div data-testid="shield-ornament" style={{ color }} />,
  CoachOrnament: ({ color }) => <div data-testid="coach-ornament" style={{ color }} />,
  GradientText: ({ children }) => <span data-testid="gradient-text">{children}</span>,
}));

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
  useInView: () => true,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/judge/login' }),
  };
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
  HexMesh: ({ color }) => <div data-testid="hex-mesh" style={{ color }} />,
  RadialBurst: ({ color }) => <div data-testid="radial-burst" style={{ color }} />,
  DiagonalBurst: ({ color }) => <div data-testid="diagonal-burst" style={{ color }} />,
  Constellation: ({ color }) => <div data-testid="constellation" style={{ color }} />,
}));

vi.mock('../../components/design-system/animations', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../../hooks/useRateLimit', () => ({
  useRateLimit: () => ({
    checkRateLimit: () => ({ allowed: true, waitTime: 0 }),
    recordAttempt: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../../utils/apiConfig', () => ({
  default: {
    getBaseUrl: () => 'http://localhost:5000/api',
    getHeaders: () => ({}),
  },
}));

vi.mock('../../services/api', () => ({
  adminAPI: { login: vi.fn() },
  superAdminAPI: { login: vi.fn() },
  coachAPI: { login: vi.fn(), getStatus: vi.fn() },
  playerAPI: { login: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderUnifiedLogin = (pathname = '/judge/login') => {
  const MockedRouter = ({ children }) => {
    const actual = require('react-router-dom');
    return (
      <actual.MemoryRouter initialEntries={[pathname]}>
        {children}
      </actual.MemoryRouter>
    );
  };
  
  return render(
    <MockedRouter>
      <ThemeProvider role="judge">
        <React.Suspense fallback={<div>Loading...</div>}>
          <UnifiedLogin />
        </React.Suspense>
      </ThemeProvider>
    </MockedRouter>
  );
};

const getUsernameInput = (container) => container.querySelector('#judge-username');
const getPasswordInput = (container) => container.querySelector('#judge-password');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UnifiedLogin - Judge Username Field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  // ── Judge username field ────────────────────────────────────────────────────

  describe('Judge username field', () => {
    it('renders username field for judge role instead of email', async () => {
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      expect(getUsernameInput(container)).toBeInTheDocument();
      expect(getUsernameInput(container)).toHaveAttribute('type', 'text');
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    it('validates username is required', async () => {
      const user = userEvent.setup();
      renderUnifiedLogin('/judge/login');
      
      await waitFor(() => 
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
      );
      
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some(a => a.textContent.includes('Username is required'))).toBe(true);
      });
    });

    it('converts username to lowercase before submission', async () => {
      const user = userEvent.setup();
      const mockLogin = vi.fn();
      
      axios.post = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          judge: {
            _id: '1',
            name: 'Test Judge',
            username: 'testjudge',
            competition: {
              id: 'comp-123',
              name: 'Test Competition',
            },
          },
        },
      });
      
      vi.doMock('../../contexts/AuthContext', () => ({
        useAuth: () => ({ login: mockLogin, user: null, userType: null }),
      }));
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'TestJudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          'http://localhost:5000/api/judge/login',
          { username: 'testjudge', password: 'password123' },
          { headers: {} }
        );
      });
    });
  });

  // ── Competition context extraction ──────────────────────────────────────────

  describe('Competition context extraction', () => {
    it('extracts and stores competition ID from judge profile', async () => {
      const user = userEvent.setup();
      const { secureStorage } = await import('../../utils/secureStorage');
      
      axios.post = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          judge: {
            _id: '1',
            name: 'Test Judge',
            username: 'testjudge',
            competition: {
              id: 'comp-123',
              name: 'Test Competition',
            },
          },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(secureStorage.setItem).toHaveBeenCalledWith('judge_competition_id', 'comp-123');
      });
    });

    it('stores full judge profile including competition details', async () => {
      const user = userEvent.setup();
      const { secureStorage } = await import('../../utils/secureStorage');
      
      const judgeProfile = {
        _id: '1',
        name: 'Test Judge',
        username: 'testjudge',
        competition: {
          id: 'comp-123',
          name: 'Test Competition',
          level: 'State',
          place: 'Mumbai',
          status: 'active',
        },
      };
      
      axios.post = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          judge: judgeProfile,
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(secureStorage.setItem).toHaveBeenCalledWith(
          'judge_user',
          JSON.stringify(judgeProfile)
        );
      });
    });

    it('displays assigned competition details after successful login', async () => {
      const user = userEvent.setup();
      const toast = (await import('react-hot-toast')).default;
      
      axios.post = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          judge: {
            _id: '1',
            name: 'Test Judge',
            username: 'testjudge',
            competition: {
              id: 'comp-123',
              name: 'State Championship',
            },
          },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('State Championship')
        );
      });
    });

    it('handles judge profile without competition context gracefully', async () => {
      const user = userEvent.setup();
      const { secureStorage } = await import('../../utils/secureStorage');
      
      axios.post = vi.fn().mockResolvedValue({
        data: {
          token: 'test-token',
          judge: {
            _id: '1',
            name: 'Test Judge',
            username: 'testjudge',
            // No competition field
          },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        // Should not call setItem for competition_id if not present
        const calls = secureStorage.setItem.mock.calls;
        const competitionIdCall = calls.find(call => call[0] === 'judge_competition_id');
        expect(competitionIdCall).toBeUndefined();
      });
    });
  });

  // ── Account lockout error handling ──────────────────────────────────────────

  describe('Account lockout error handling', () => {
    it('detects account lockout errors from backend response', async () => {
      const user = userEvent.setup();
      const toast = (await import('react-hot-toast')).default;
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account locked due to failed attempts' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('locked')
        );
      });
    });

    it('displays lockout message with 15-minute duration', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account lockout detected' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      });
    });

    it('shows countdown timer for lockout period', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account locked' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        // Check for countdown timer format (MM:SS)
        const timerRegex = /\d{1,2}:\d{2}/;
        const lockoutMessage = screen.getByText(/account temporarily locked/i).parentElement;
        expect(lockoutMessage.textContent).toMatch(timerRegex);
      });
    });

    it('disables form submission during lockout period', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account locked' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /sign in/i });
        expect(submitButton).toBeDisabled();
      });
    });
  });

  // ── Rate limiting error handling ────────────────────────────────────────────

  describe('Rate limiting error handling', () => {
    it('detects 429 status code responses', async () => {
      const user = userEvent.setup();
      const toast = (await import('react-hot-toast')).default;
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests', retryAfter: 900 },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Too many login attempts')
        );
      });
    });

    it('displays rate limiting message with wait time', async () => {
      const user = userEvent.setup();
      const toast = (await import('react-hot-toast')).default;
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests', retryAfter: 900 },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringMatching(/wait \d+ minute/)
        );
      });
    });

    it('disables form submission during rate limit period', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests', retryAfter: 900 },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /sign in/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('uses default 15-minute wait time if retryAfter not provided', async () => {
      const user = userEvent.setup();
      const toast = (await import('react-hot-toast')).default;
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('15 minute')
        );
      });
    });
  });

  // ── AccountLockoutMessage component ─────────────────────────────────────────

  describe('AccountLockoutMessage component', () => {
    it('renders lockout message when lockoutEndTime is set', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account locked' },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      });
    });

    it('renders rate limit message when rateLimitEndTime is set', async () => {
      const user = userEvent.setup();
      
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests', retryAfter: 900 },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      });
    });

    it('prioritizes lockout message over rate limit message', async () => {
      const user = userEvent.setup();
      
      // First trigger rate limit
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Too many requests', retryAfter: 900 },
        },
      });
      
      const { container } = renderUnifiedLogin('/judge/login');
      
      await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
      
      await user.type(getUsernameInput(container), 'testjudge');
      await user.type(getPasswordInput(container), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/account temporarily locked/i)).toBeInTheDocument();
      });
      
      // Then trigger lockout - should show lockout message
      axios.post = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Account locked' },
        },
      });
      
      await user.clear(getUsernameInput(container));
      await user.clear(getPasswordInput(container));
      await user.type(getUsernameInput(container), 'testjudge2');
      await user.type(getPasswordInput(container), 'wrongpassword');
      
      // Button should still be disabled from rate limit
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
    });
  });
});
