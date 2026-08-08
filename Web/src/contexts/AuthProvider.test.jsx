import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AuthProvider from './AuthProvider';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from './AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import { authEventBus, AUTH_EXPIRED } from '@/utils/auth/authEvents';
import { useContext } from 'react';

// Mock secureStorage
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clearForRole: vi.fn()
  }
}));

// Mock API config
vi.mock('@/config/api.config', () => ({
  default: {
    AUTH_COOKIE_NAME: 'access_token',
    getBaseUrl: () => 'http://test.local/api',
    getHeaders: () => ({}),
  }
}));

// MED-W1 added a cookie-based session bootstrap. Mocked here so this suite
// stays about auth state rather than transport — importing the real auth.api
// pulls in api-client, which builds axios instances at module load.
// Rejecting by default means "no cookie session", the pre-existing behaviour
// every test below was written against.
vi.mock('@/services/auth/auth.api', () => ({
  authAPI: {
    me: vi.fn().mockRejectedValue(new Error('no session')),
  },
}));

// Helper to access context in tests
const ContextConsumer = () => {
  const { user, userType, login, logout } = useContext(AuthContext);
  return (
    <div>
      <span data-testid="user">{user ? user.name : 'null'}</span>
      <span data-testid="userType">{userType || 'null'}</span>
      <button onClick={() => login({ name: 'Admin User' }, 'valid-token', 'admin')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const renderAuthProvider = (initialPath = '/admin/dashboard') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ContextConsumer />
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('AuthProvider', () => {
  // handleLogout POSTs /auth/logout with raw fetch. Left unmocked, jsdom
  // attempts real network I/O that does not settle within act(), so the
  // handler never reaches its storage cleanup and the assertions below see
  // nothing. Stubbed so the test exercises logout, not the network.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads auth data from storage on mount if available', () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_user') return JSON.stringify({ name: 'Admin User' });
      return null;
    });

    renderAuthProvider('/admin/dashboard');

    expect(screen.getByTestId('user').textContent).toBe('Admin User');
    expect(screen.getByTestId('userType').textContent).toBe('admin');
  });

  it('migrates legacy un-prefixed keys to prefixed keys', () => {
    // Return null for prefixed keys
    secureStorage.getItem.mockReturnValue(null);
    
    // Set legacy keys in regular localStorage
    localStorage.setItem('token', 'legacy-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Legacy Admin' }));
    localStorage.setItem('userType', 'admin');

    renderAuthProvider('/admin/dashboard');

    expect(secureStorage.setItem).toHaveBeenCalledWith('admin_token', 'legacy-token');
    expect(secureStorage.setItem).toHaveBeenCalledWith('admin_user', JSON.stringify({ name: 'Legacy Admin' }));
    
    expect(localStorage.getItem('token')).toBeNull(); // Should be cleaned up
    
    expect(screen.getByTestId('user').textContent).toBe('Legacy Admin');
    expect(screen.getByTestId('userType').textContent).toBe('admin');
  });

  it('updates state and storage on login', () => {
    secureStorage.getItem.mockReturnValue(null);
    renderAuthProvider('/admin/login');

    act(() => {
      screen.getByText('Login').click();
    });

    expect(secureStorage.setItem).toHaveBeenCalledWith('admin_user', JSON.stringify({ name: 'Admin User' }));
    
    expect(screen.getByTestId('user').textContent).toBe('Admin User');
    expect(screen.getByTestId('userType').textContent).toBe('admin');
  });

  // `handleLogout` awaits POST /auth/logout, so it is genuinely asynchronous.
  // This previously passed synchronously only by accident: the apiConfig mock
  // had no getBaseUrl, so the handler threw before reaching its await. Now that
  // the mock is complete, the await actually happens and the test must wait.
  it('clears state and storage on logout', async () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_user') return JSON.stringify({ name: 'Admin User' });
      return null;
    });

    renderAuthProvider('/admin/dashboard');

    // Make sure we are logged in
    expect(screen.getByTestId('user').textContent).toBe('Admin User');

    await act(async () => {
      screen.getByText('Logout').click();
    });

    expect(secureStorage.clearForRole).toHaveBeenCalledWith('admin');
    
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('userType').textContent).toBe('null');
  });

  it('listens for AUTH_EXPIRED events and logs user out', () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_user') return JSON.stringify({ name: 'Admin User' });
      return null;
    });

    renderAuthProvider('/admin/dashboard');

    // Manually trigger the event
    act(() => {
      authEventBus.dispatchEvent(new CustomEvent(AUTH_EXPIRED));
    });

    expect(secureStorage.clearForRole).toHaveBeenCalledWith('admin');
    expect(screen.getByTestId('user').textContent).toBe('null');
  });
});
