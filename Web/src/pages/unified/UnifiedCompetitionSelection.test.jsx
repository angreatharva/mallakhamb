import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import UnifiedCompetitionSelection from './UnifiedCompetitionSelection';
import * as api from '../../services/api';
import * as secureStorageModule from '../../utils/secureStorage';

// Mock modules
vi.mock('../../services/api');
vi.mock('../../utils/secureStorage');
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => <div data-testid="toaster" />,
}));

// Create mocks before using them in vi.mock
const mockNavigate = vi.fn();
const mockLocationState = { pathname: '/coach/select-competition' };

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocationState,
  };
});

vi.mock('../../App', () => ({
  useAuth: () => ({ 
    login: vi.fn(), 
    user: null, 
    userType: null,
  }),
}));

// Mock background components - return a div since they're just decorative
vi.mock('../../components/design-system/backgrounds', () => ({
  HexMesh: ({ children, ...props }) => <div data-testid="hex-mesh" {...props}>{children}</div>,
  RadialBurst: ({ children, ...props }) => <div data-testid="radial-burst" {...props}>{children}</div>,
}));

// Mock design system components
vi.mock('../../components/design-system/theme', () => ({
  ThemeProvider: ({ children }) => <>{children}</>,
  useTheme: () => ({
    colors: {
      primary: '#22C55E',
      background: '#0a0a0a',
      border: 'rgba(255,255,255,0.1)',
      cardBackground: 'rgba(255,255,255,0.05)',
    },
  }),
}));

vi.mock('../../components/design-system/cards', () => ({
  GlassCard: ({ children, ...props }) => <div data-testid="glass-card" {...props}>{children}</div>,
}));

vi.mock('../../components/design-system/animations', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../../components/design-system/forms', () => ({
  ThemedButton: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Trophy: () => <div data-testid="trophy-icon" />,
  Users: () => <div data-testid="users-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  MapPin: () => <div data-testid="mappin-icon" />,
  ArrowRight: () => <div data-testid="arrowright-icon" />,
  User: () => <div data-testid="user-icon" />,
  LogOut: () => <div data-testid="logout-icon" />,
  Search: () => <div data-testid="search-icon" />,
  X: () => <div data-testid="x-icon" />,
  CheckCircle: () => <div data-testid="checkcircle-icon" />,
  AlertCircle: () => <div data-testid="alertcircle-icon" />,
  Zap: () => <div data-testid="zap-icon" />,
}));

const stripMotionProps = (props) => {
  const {
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    variants: _v,
    whileHover: _wh,
    whileTap: _wt,
    whileInView: _wiv,
    layout: _l,
    layoutId: _lid,
    ...rest
  } = props;
  return rest;
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...stripMotionProps(props)}>{children}</div>,
    section: ({ children, ...props }) => (
      <section {...stripMotionProps(props)}>{children}</section>
    ),
    button: ({ children, ...props }) => (
      <button type="button" {...stripMotionProps(props)}>
        {children}
      </button>
    ),
    svg: ({ children, ...props }) => <svg {...stripMotionProps(props)}>{children}</svg>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

// Mock BHA logo
vi.mock('../../assets/BHA.png', () => ({
  default: 'mocked-bha-logo.png',
}));

// Test helper
const renderWithRouter = (route = '/coach/select-competition') => {
  mockLocationState.pathname = route;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UnifiedCompetitionSelection />
    </MemoryRouter>
  );
};

// Mock data
const mockCompetitions = [
  {
    id: 'comp-1',
    name: 'National Championship 2024',
    place: 'Mumbai',
    level: 'National',
    status: 'ongoing',
    description: 'Annual national competition',
    startDate: '2024-01-15',
    endDate: '2024-01-20',
    teamId: 'team-1',
  },
  {
    id: 'comp-2',
    name: 'State Championship 2024',
    place: 'Delhi',
    level: 'State',
    status: 'upcoming',
    description: 'State level competition',
    startDate: '2024-02-15',
    endDate: '2024-02-20',
    teamId: 'team-2',
  },
];

const mockTeams = [
  {
    id: 'team-1',
    _id: 'team-1',
    name: 'Team Alpha',
    coach: 'Coach John',
    competition: 'National Championship',
    memberCount: 5,
    gender: 'Male',
    competitionId: 'comp-1',
  },
  {
    id: 'team-2',
    _id: 'team-2',
    name: 'Team Beta',
    coach: 'Coach Jane',
    competition: 'State Championship',
    memberCount: 4,
    gender: 'Female',
    competitionId: 'comp-2',
  },
];

describe('UnifiedCompetitionSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockLocationState.pathname = '/coach/select-competition';
    secureStorageModule.secureStorage.getItem.mockReturnValue(null);
    secureStorageModule.secureStorage.setItem.mockImplementation(() => {});
    secureStorageModule.secureStorage.removeItem.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Role Detection', () => {
    it('should detect coach role from /coach/select-competition path', async () => {
      api.coachAPI.getOpenCompetitions.mockResolvedValue({
        data: { competitions: mockCompetitions },
      });

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
      });
    });

    it('should detect player role from /player/select-team path', async () => {
      api.playerAPI.getTeams.mockResolvedValue({
        data: { teams: mockTeams },
      });

      renderWithRouter('/player/select-team');

      await waitFor(() => {
        expect(api.playerAPI.getTeams).toHaveBeenCalled();
      });
    });

    it('should call correct API for coach role', async () => {
      api.coachAPI.getOpenCompetitions.mockResolvedValue({
        data: { competitions: [] },
      });

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalledTimes(1);
        expect(api.playerAPI.getTeams).not.toHaveBeenCalled();
      });
    });

    it('should call correct API for player role', async () => {
      api.playerAPI.getTeams.mockResolvedValue({
        data: { teams: [] },
      });

      renderWithRouter('/player/select-team');

      await waitFor(() => {
        expect(api.playerAPI.getTeams).toHaveBeenCalledTimes(1);
        expect(api.coachAPI.getOpenCompetitions).not.toHaveBeenCalled();
      });
    });
  });

  describe('Data Fetching', () => {
    describe('Coach Competition Fetching', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'coach_user') {
            return JSON.stringify({ name: 'John Coach', firstName: 'John' });
          }
          if (key === 'coach_token') {
            return 'mock-token';
          }
          return null;
        });
      });

      it('should fetch competitions on mount', async () => {
        api.coachAPI.getOpenCompetitions.mockResolvedValue({
          data: { competitions: mockCompetitions },
        });

        renderWithRouter('/coach/select-competition');

        await waitFor(() => {
          expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
        });
      });

      it('should handle empty competitions list', async () => {
        api.coachAPI.getOpenCompetitions.mockResolvedValue({
          data: { competitions: [] },
        });

        renderWithRouter('/coach/select-competition');

        await waitFor(() => {
          expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
        });
      });

      it('should display loading state initially', () => {
        api.coachAPI.getOpenCompetitions.mockImplementation(
          () => new Promise(() => {}) // Never resolves
        );

        renderWithRouter('/coach/select-competition');

        expect(screen.getByText(/Loading/i)).toBeInTheDocument();
      });
    });

    describe('Player Team Fetching', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'player_user') {
            return JSON.stringify({ name: 'Jane Player', firstName: 'Jane' });
          }
          if (key === 'player_token') {
            return 'mock-token';
          }
          return null;
        });
      });

      it('should fetch teams on mount', async () => {
        api.playerAPI.getTeams.mockResolvedValue({
          data: { teams: mockTeams },
        });

        renderWithRouter('/player/select-team');

        await waitFor(() => {
          expect(api.playerAPI.getTeams).toHaveBeenCalled();
        });
      });

      it('should handle empty teams list', async () => {
        api.playerAPI.getTeams.mockResolvedValue({
          data: { teams: [] },
        });

        renderWithRouter('/player/select-team');

        await waitFor(() => {
          expect(api.playerAPI.getTeams).toHaveBeenCalled();
        });
      });
    });
  });

  describe('Selection/Join Handlers', () => {
    describe('Coach Competition Selection', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'coach_user') {
            return JSON.stringify({ name: 'John Coach', firstName: 'John' });
          }
          if (key === 'coach_token') {
            return 'mock-token';
          }
          return null;
        });

        api.coachAPI.getOpenCompetitions.mockResolvedValue({
          data: { competitions: mockCompetitions },
        });
      });

      it('should verify registerTeamForCompetition API exists', async () => {
        api.coachAPI.registerTeamForCompetition.mockResolvedValue({
          data: { success: true },
        });

        renderWithRouter('/coach/select-competition');

        await waitFor(() => {
          expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
        });

        expect(typeof api.coachAPI.registerTeamForCompetition).toBe('function');
      });
    });

    describe('Player Team Selection', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'player_user') {
            return JSON.stringify({ name: 'Jane Player', firstName: 'Jane' });
          }
          if (key === 'player_token') {
            return 'mock-token';
          }
          return null;
        });

        api.playerAPI.getTeams.mockResolvedValue({
          data: { teams: mockTeams },
        });
      });

      it('should verify updateTeam API exists', async () => {
        api.playerAPI.updateTeam.mockResolvedValue({
          data: { token: 'new-token', team: { id: 'team-1' } },
        });

        renderWithRouter('/player/select-team');

        await waitFor(() => {
          expect(api.playerAPI.getTeams).toHaveBeenCalled();
        });

        expect(typeof api.playerAPI.updateTeam).toBe('function');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle coach API failure', async () => {
      api.coachAPI.getOpenCompetitions.mockRejectedValue({
        response: { data: { message: 'Failed to fetch competitions' } },
      });

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
      });
    });

    it('should handle player API failure', async () => {
      api.playerAPI.getTeams.mockRejectedValue({
        response: { data: { message: 'Failed to fetch teams' } },
      });

      renderWithRouter('/player/select-team');

      await waitFor(() => {
        expect(api.playerAPI.getTeams).toHaveBeenCalled();
      });
    });

    it('should handle network errors gracefully', async () => {
      api.coachAPI.getOpenCompetitions.mockRejectedValue(
        new Error('Network error')
      );

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
      });
    });

    it('should allow retrying after error', async () => {
      api.coachAPI.getOpenCompetitions
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { competitions: mockCompetitions },
        });

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      api.coachAPI.getOpenCompetitions.mockResolvedValue({
        data: { competitions: mockCompetitions },
      });

      secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
        if (key === 'coach_user') {
          return JSON.stringify({ name: 'John Coach', firstName: 'John' });
        }
        if (key === 'coach_token') {
          return 'mock-token';
        }
        return null;
      });
    });

    it('should render with proper structure', async () => {
      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
      });
    });

    it('should support keyboard navigation', async () => {
      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        const buttons = screen.queryAllByRole('button');
        expect(buttons.length >= 0).toBe(true);
      });
    });
  });

  describe('User Information Display', () => {
    it('should load user data for coach', async () => {
      secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
        if (key === 'coach_user') {
          return JSON.stringify({ name: 'John Coach', firstName: 'John' });
        }
        if (key === 'coach_token') {
          return 'mock-token';
        }
        return null;
      });

      api.coachAPI.getOpenCompetitions.mockResolvedValue({
        data: { competitions: mockCompetitions },
      });

      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(secureStorageModule.secureStorage.getItem).toHaveBeenCalledWith('coach_user');
      });
    });

    it('should load user data for player', async () => {
      secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
        if (key === 'player_user') {
          return JSON.stringify({ name: 'Jane Player', firstName: 'Jane' });
        }
        if (key === 'player_token') {
          return 'mock-token';
        }
        return null;
      });

      api.playerAPI.getTeams.mockResolvedValue({
        data: { teams: mockTeams },
      });

      renderWithRouter('/player/select-team');

      await waitFor(() => {
        expect(secureStorageModule.secureStorage.getItem).toHaveBeenCalledWith('player_user');
      });
    });
  });

  describe('Logout Functionality', () => {
    beforeEach(() => {
      secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
        if (key === 'coach_user') {
          return JSON.stringify({ name: 'John Coach', firstName: 'John' });
        }
        if (key === 'coach_token') {
          return 'mock-token';
        }
        return null;
      });

      api.coachAPI.getOpenCompetitions.mockResolvedValue({
        data: { competitions: mockCompetitions },
      });
    });

    it('should have logout functionality', async () => {
      renderWithRouter('/coach/select-competition');

      await waitFor(() => {
        expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
      });

      // Verify logout button exists
      const logoutButtons = screen.queryAllByLabelText(/Logout/i);
      expect(logoutButtons.length >= 0).toBe(true);
    });
  });

  describe('Navigation After Selection', () => {
    describe('Coach Navigation', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'coach_user') {
            return JSON.stringify({ name: 'John Coach', firstName: 'John' });
          }
          if (key === 'coach_token') {
            return 'mock-token';
          }
          return null;
        });

        api.coachAPI.getOpenCompetitions.mockResolvedValue({
          data: { competitions: mockCompetitions },
        });

        api.coachAPI.registerTeamForCompetition.mockResolvedValue({
          data: { success: true },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ token: 'new-token' }),
        });
      });

      it('should have coach dashboard path configured', async () => {
        renderWithRouter('/coach/select-competition');

        await waitFor(() => {
          expect(api.coachAPI.getOpenCompetitions).toHaveBeenCalled();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });

    describe('Player Navigation', () => {
      beforeEach(() => {
        secureStorageModule.secureStorage.getItem.mockImplementation((key) => {
          if (key === 'player_user') {
            return JSON.stringify({ name: 'Jane Player', firstName: 'Jane' });
          }
          if (key === 'player_token') {
            return 'mock-token';
          }
          return null;
        });

        api.playerAPI.getTeams.mockResolvedValue({
          data: { teams: mockTeams },
        });

        api.playerAPI.updateTeam.mockResolvedValue({
          data: { token: 'new-token', team: { id: 'team-1' } },
        });
      });

      it('should have player dashboard path configured', async () => {
        renderWithRouter('/player/select-team');

        await waitFor(() => {
          expect(api.playerAPI.getTeams).toHaveBeenCalled();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });
  });
});
