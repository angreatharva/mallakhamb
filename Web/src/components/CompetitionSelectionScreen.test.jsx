import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import CompetitionSelectionScreen from './CompetitionSelectionScreen';

// Mock modules
vi.mock('../services/api', () => ({
  coachAPI: {
    getTeams: vi.fn(),
    getOpenCompetitions: vi.fn(),
    registerTeamForCompetition: vi.fn(),
  },
}));
vi.mock('../utils/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { 
    ...actual, 
    useNavigate: () => mockNavigate,
  };
});

const mockCompetitionContext = {
  assignedCompetitions: [],
  switchCompetition: vi.fn(),
  isLoading: false,
};

vi.mock('../contexts/CompetitionContext', () => ({
  useCompetition: () => mockCompetitionContext,
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
    span: ({ children, ...props }) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

// Mock the Home components
vi.mock('../pages/public/Home', () => ({
  COLORS: {
    saffron: '#FF6B00',
    saffronLight: '#FF8C38',
    saffronDark: '#CC5500',
    dark: '#0a0a0a',
    darkBorderSubtle: 'rgba(255,255,255,0.1)',
  },
  useReducedMotion: () => false,
  GradientText: ({ children }) => <span>{children}</span>,
  FadeIn: ({ children }) => <div>{children}</div>,
}));

const mockPlayerCompetitions = [
  {
    id: 'comp-1',
    _id: 'comp-1',
    name: 'Maharashtra Mallakhamb Competition',
    place: 'Pune',
    level: 'state',
    status: 'upcoming',
    description: 'State level tournament',
  },
  {
    id: 'comp-2',
    _id: 'comp-2',
    name: 'District Championship',
    place: 'Nashik',
    level: 'district',
    status: 'ongoing',
    description: 'District championship event',
  },
];

describe('CompetitionSelectionScreen - Player Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockCompetitionContext.assignedCompetitions = [];
    mockCompetitionContext.isLoading = false;
    mockCompetitionContext.switchCompetition = vi.fn().mockResolvedValue(undefined);
  });

  it('should render player competition selection with coach-aligned title', async () => {
    mockCompetitionContext.assignedCompetitions = mockPlayerCompetitions;

    render(
      <MemoryRouter>
        <CompetitionSelectionScreen userType="player" onCompetitionSelected={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Competition Selection')).toBeInTheDocument();
      expect(screen.getByText('Choose Your')).toBeInTheDocument();
      expect(screen.getByText('Arena')).toBeInTheDocument();
    });
  });

  it('should display assigned competitions for player', async () => {
    mockCompetitionContext.assignedCompetitions = mockPlayerCompetitions;

    render(
      <MemoryRouter>
        <CompetitionSelectionScreen userType="player" onCompetitionSelected={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Maharashtra Mallakhamb Competition')).toBeInTheDocument();
      expect(screen.getByText('District Championship')).toBeInTheDocument();
      expect(screen.getByText('Pune')).toBeInTheDocument();
      expect(screen.getByText('Nashik')).toBeInTheDocument();
    });
  });

  it('should show correct button text for player', async () => {
    mockCompetitionContext.assignedCompetitions = mockPlayerCompetitions;

    render(
      <MemoryRouter>
        <CompetitionSelectionScreen userType="player" onCompetitionSelected={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Continue to Dashboard')).toBeInTheDocument();
    });
  });

  it('should handle empty competitions list', async () => {
    mockCompetitionContext.assignedCompetitions = [];

    render(
      <MemoryRouter>
        <CompetitionSelectionScreen userType="player" onCompetitionSelected={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No Competitions')).toBeInTheDocument();
      expect(screen.getByText(/You are not assigned to any competitions yet/)).toBeInTheDocument();
    });
  });

  it('should use correct search placeholder for player', async () => {
    const manyCompetitions = [
      ...mockPlayerCompetitions,
      {
        id: 'comp-3',
        _id: 'comp-3',
        name: 'Regional Championship',
        place: 'Kolhapur',
        level: 'regional',
        status: 'upcoming',
      },
      {
        id: 'comp-4',
        _id: 'comp-4',
        name: 'Local Championship',
        place: 'Satara',
        level: 'local',
        status: 'completed',
      },
    ];
    mockCompetitionContext.assignedCompetitions = manyCompetitions;

    render(
      <MemoryRouter>
        <CompetitionSelectionScreen userType="player" onCompetitionSelected={() => {}} />
      </MemoryRouter>
    );

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText(/Search by name, place, level, or status/);
      expect(searchInput).toBeInTheDocument();
    });
  });
});