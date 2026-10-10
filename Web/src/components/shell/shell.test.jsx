/**
 * The working-screen shell and the brand (design-language PLAN §7, D9; Phase 4).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader, AccountControls, PageHeader, RoleIdent, TabNav } from './index';
import { PoleMark, Wordmark, BRAND_NAME } from '@/components/brand/Brand';

const NAV = [
  { to: '/admin/dashboard', label: 'Overview', end: true },
  { to: '/admin/dashboard/teams', label: 'Teams' },
  { to: '/admin/dashboard/scores', label: 'Scores' },
];
const at = (path, ui) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe('brand', () => {
  it('names the brand once, as text, and links home', () => {
    at('/', <Wordmark />);
    expect(screen.getByRole('link', { name: BRAND_NAME })).toHaveAttribute('href', '/');
    expect(BRAND_NAME).toBe('Mallakhamb India');
  });

  it('a compact wordmark keeps its name for screen readers', () => {
    at('/', <Wordmark compact />);
    expect(screen.getByRole('link', { name: BRAND_NAME })).toBeInTheDocument();
  });

  it('the pole mark is decorative unless it is given a title', () => {
    const { container } = render(<><PoleMark /><PoleMark title="Mallakhamb India" /></>);
    const [plain, named] = container.querySelectorAll('svg');
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    expect(named).toHaveAttribute('role', 'img');
    expect(named).toHaveAccessibleName('Mallakhamb India');
  });
});

describe('shell', () => {
  it('shows the role as text, never colour alone', () => {
    render(<RoleIdent role="superadmin" />);
    expect(screen.getByText('Super Admin')).toHaveClass('ui-tag--ident');
  });

  it('marks the current page in the tabs', () => {
    at('/admin/dashboard/teams', <TabNav items={NAV} label="Admin sections" />);
    expect(screen.getByRole('navigation', { name: 'Admin sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Teams' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('logs out from the account controls', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    at('/', <AccountControls onLogout={onLogout} profileTo="/judge/profile" />);
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/judge/profile');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('the masthead: brand, role, competition; the menu opens a drawer with the sections and the account', async () => {
    const user = userEvent.setup();
    at('/admin/dashboard', <AppHeader role="admin" segment="SGAM-TRIALS-1 (2026)" nav={NAV} navLabel="Admin sections" onLogout={() => {}} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toHaveClass('ui-tag--ident');
    expect(screen.getByText('SGAM-TRIALS-1 (2026)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu' });
    expect(drawer).toHaveClass('ui-dialog--sheet');
    expect(drawer).toContainElement(screen.getAllByRole('link', { name: 'Teams' }).at(-1));
    expect(drawer).toContainElement(screen.getAllByRole('button', { name: 'Log out' }).at(-1));
    await user.click(screen.getAllByRole('link', { name: 'Teams' }).at(-1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the page header is the page h1, with its actions', () => {
    render(<PageHeader eyebrow="Pole · Under 14 Boys" title="Running order" actions={<button type="button">Draw lots</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Running order' })).toHaveClass('type-display-l');
    expect(screen.getByRole('button', { name: 'Draw lots' })).toBeInTheDocument();
  });
});
