import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../components/design-system/theme/ThemeProvider';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  authAPI: {
    forgotPassword: vi.fn().mockResolvedValue({}),
    verifyOTP: vi.fn().mockResolvedValue({}),
    resetPasswordWithOTP: vi.fn().mockResolvedValue({}),
    resetPassword: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('../hooks/queries/useTeamsQuery', () => ({
  useTeamsQuery: () => ({
    data: [{ _id: 'team-1', name: 'Team A' }],
    isError: false,
    error: null,
  }),
}));

vi.mock('../hooks/queries/useScoresQuery', () => ({
  useScoresQuery: () => ({
    data: [
      {
        _id: 'score-1',
        teamName: 'Team A',
        gender: 'Male',
        ageGroup: 'Under12',
        createdAt: new Date().toISOString(),
        playerScores: [
          {
            playerId: 'player-1',
            playerName: 'Player One',
            finalScore: 9.5,
            executionAverage: 9.0,
            averageMarks: 9.2,
            deduction: 0,
            otherDeduction: 0,
            baseScoreApplied: false,
            judgeScores: {
              seniorJudge: 9.5,
              judge1: 9.2,
              judge2: 9.4,
              judge3: 9.3,
              judge4: 9.1,
            },
          },
        ],
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../hooks/mutations/useCreateTeamMutation', () => ({
  useCreateTeamMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../components/Dropdown', () => ({
  default: ({ options, value, onChange, placeholder, disabled }) => (
    <select
      aria-label={placeholder}
      disabled={disabled}
      value={value?.value || ''}
      onChange={(event) => {
        const selected = options.find((item) => item.value === event.target.value) || null;
        onChange(selected);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('framer-motion', async () => {
  const ReactActual = await import('react');

  const motion = new Proxy(
    {},
    {
      get: (_, tag) =>
        ReactActual.forwardRef(({ children, ...props }, ref) =>
          ReactActual.createElement(tag, { ref, ...props }, children)
        ),
    }
  );

  return {
    motion,
    AnimatePresence: ({ children }) => <>{children}</>,
    useInView: () => true,
    useScroll: () => ({ scrollYProgress: 0 }),
    useTransform: () => 0,
    useMotionValue: () => ({ set: vi.fn() }),
    useSpring: (value) => value,
  };
});

import ForgotPassword from './shared/ForgotPassword';
import ResetPassword from './shared/ResetPassword';
import PublicScores from './public/PublicScores';
import CoachCreateTeam from './coach/CoachCreateTeam';

const renderA11yPage = (path, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider role="coach">
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>
  );

const A11Y_TIMEOUT_MS = 60000;

describe('Page accessibility coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login recovery page passes axe checks', async () => {
    const { container } = renderA11yPage('/forgot-password', <ForgotPassword />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  }, A11Y_TIMEOUT_MS);

  it('dashboard-like scoring page passes axe checks', async () => {
    const { container } = renderA11yPage('/scores', <PublicScores />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  }, A11Y_TIMEOUT_MS);

  it('team management page passes axe checks', async () => {
    const { container } = renderA11yPage('/coach/create-team', <CoachCreateTeam />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  }, A11Y_TIMEOUT_MS);

  it('password reset page passes axe checks', async () => {
    const { container } = renderA11yPage('/reset-password', <ResetPassword />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  }, A11Y_TIMEOUT_MS);
});
