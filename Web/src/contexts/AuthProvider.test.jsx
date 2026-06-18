import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    AUTH_COOKIE_NAME: 'access_token'
  }
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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads auth data from storage on mount if available', () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_token') return 'mock-token';
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

    expect(secureStorage.setItem).toHaveBeenCalledWith('admin_token', 'valid-token');
    expect(secureStorage.setItem).toHaveBeenCalledWith('admin_user', JSON.stringify({ name: 'Admin User' }));
    
    expect(screen.getByTestId('user').textContent).toBe('Admin User');
    expect(screen.getByTestId('userType').textContent).toBe('admin');
  });

  it('clears state and storage on logout', () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_token') return 'mock-token';
      if (key === 'admin_user') return JSON.stringify({ name: 'Admin User' });
      return null;
    });

    renderAuthProvider('/admin/dashboard');

    // Make sure we are logged in
    expect(screen.getByTestId('user').textContent).toBe('Admin User');

    act(() => {
      screen.getByText('Logout').click();
    });

    expect(secureStorage.clearForRole).toHaveBeenCalledWith('admin');
    
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('userType').textContent).toBe('null');
  });

  it('listens for AUTH_EXPIRED events and logs user out', () => {
    secureStorage.getItem.mockImplementation((key) => {
      if (key === 'admin_token') return 'mock-token';
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
