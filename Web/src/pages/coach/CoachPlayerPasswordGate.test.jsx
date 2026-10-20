/**
 * A coach's first job is the default player password: every coach page waits
 * for it, then they carry on to where they were going.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coachAPI } from '@/services/api';
import { CoachPlayerPasswordGate, SETUP_PATH, markPlayerPasswordReady } from './CoachPlayerPasswordGate';

vi.mock('@/services/api', () => ({ coachAPI: { playerDefaultPassword: { get: vi.fn() } } }));

const respond = (data) => Promise.resolve({ data: { data } });

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}|{location.state?.from || ''}</p>;
};

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="*" element={<CoachPlayerPasswordGate><Where /></CoachPlayerPasswordGate>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('CoachPlayerPasswordGate', () => {
  it('sends a coach with no default to the setup screen, remembering the page', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: false, readable: false }));
    renderAt('/coach/dashboard?x=1');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`${SETUP_PATH}|/coach/dashboard?x=1`));
  });

  it('a saved default that cannot be read counts as not set', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: true, readable: false }));
    renderAt('/coach/select-level');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(SETUP_PATH));
  });

  it('after setup saves, the next page opens instead of bouncing back', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: false, readable: false }));
    const Setup = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => { markPlayerPasswordReady(); navigate('/coach/create-team'); }}>Save</button>
      );
    };
    render(
      <MemoryRouter initialEntries={['/coach/create-team']}>
        <Routes>
          <Route
            path="*"
            element={(
              <CoachPlayerPasswordGate>
                <Routes>
                  <Route path={SETUP_PATH} element={<Setup />} />
                  <Route path="*" element={<Where />} />
                </Routes>
              </CoachPlayerPasswordGate>
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    (await screen.findByRole('button', { name: 'Save' })).click();
    expect(await screen.findByText('/coach/create-team|')).toBeInTheDocument();
  });

  it('lets the coach through once set, and asks the server once per sign-in', async () => {
    coachAPI.playerDefaultPassword.get.mockImplementation(() => respond({ isSet: true, readable: true, password: 'x' }));
    const { unmount } = renderAt('/coach/dashboard');
    expect(await screen.findByText('/coach/dashboard|')).toBeInTheDocument();
    unmount();

    renderAt('/coach/profile');
    expect(screen.getByText('/coach/profile|')).toBeInTheDocument();
    expect(coachAPI.playerDefaultPassword.get).toHaveBeenCalledTimes(1);
  });
});
