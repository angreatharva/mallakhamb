/**
 * The working-screen shell and the brand (design-language PLAN §7, D9; Phase 4).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppHeader, AccountControls, PageHeader, RoleIdent, TabNav, AuthLayout, AuthHeader } from './index';
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
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('opens an account menu with the profile, password and email', async () => {
    const user = userEvent.setup();
    at('/', <AccountControls onLogout={vi.fn()} profileTo="/coach/profile" />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['My profile', 'Change password', 'Update email']);
  });

  it('lists the same three as links in the phone drawer', () => {
    at('/', <AccountControls onLogout={vi.fn()} profileTo="/coach/profile" drawer />);
    expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', '/coach/profile');
    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/coach/profile#password');
    expect(screen.getByRole('link', { name: 'Update email' })).toHaveAttribute('href', '/coach/profile#email');
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
    expect(drawer).toContainElement(screen.getAllByRole('button', { name: 'Logout' }).at(-1));
    await user.click(screen.getAllByRole('link', { name: 'Teams' }).at(-1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the page header is the page h1, with its actions', () => {
    render(<PageHeader eyebrow="Pole · Under 14 Boys" title="Running order" actions={<button type="button">Draw lots</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Running order' })).toHaveClass('type-display-l');
    expect(screen.getByRole('button', { name: 'Draw lots' })).toBeInTheDocument();
  });
});

describe('AuthLayout', () => {
  it('the role name is the h1, the form title an h2, and the stage is always the dark stage', () => {
    at('/coach/login', (
      <AuthLayout role="coach" title="Coach" lede="Manage your team." switcher>
        <AuthHeader tag="Coach Access" title="Sign In" />
      </AuthLayout>
    ));
    expect(screen.getByRole('heading', { level: 1, name: 'Coach' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Coach' })).toHaveAttribute('data-appearance', 'dark');
  });

  it('the portal row marks the current portal and offers the others', () => {
    at('/coach/login', <AuthLayout role="coach" title="Coach" switcher><p>form</p></AuthLayout>);
    const nav = screen.getByRole('navigation', { name: 'Sign in as' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Coach' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Judge' })).toHaveAttribute('href', '/judge/login');
  });

  it('no portal row unless asked (registration, reset)', () => {
    at('/coach/register', <AuthLayout role="coach" title="Coach"><p>form</p></AuthLayout>);
    expect(screen.queryByRole('navigation', { name: 'Sign in as' })).toBeNull();
  });
});
