import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './protected-route';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import * as tokenUtils from '@/utils/auth/tokenUtils';

// Mock responsive hook
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false })
}));

// Mock secureStorage
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(),
    removeItem: vi.fn(),
  }
}));

// Mock tokenUtils
vi.mock('@/utils/auth/tokenUtils', () => ({
  isTokenExpired: vi.fn()
}));

const renderWithContext = (ui, authValue, initialRoute = '/admin/dashboard') => {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="*" element={ui} />
          <Route path="/admin/login" element={<div>Admin Login Page</div>} />
          <Route path="/player/login" element={<div>Player Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when authenticated and authorized', () => {
    const authValue = { user: { id: 1 }, userType: 'admin' };
    
    renderWithContext(
      <ProtectedRoute requiredUserType="admin">
        <div>Protected Content</div>
      </ProtectedRoute>,
      authValue
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated', () => {
    const authValue = { user: null, userType: null };
    secureStorage.getItem.mockReturnValue(null); // No stored token

    renderWithContext(
      <ProtectedRoute requiredUserType="admin">
        <div>Protected Content</div>
      </ProtectedRoute>,
      authValue
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Login Page')).toBeInTheDocument();
  });

  it('redirects to correct login page based on route when unauthorized', () => {
    const authValue = { user: null, userType: null };
    secureStorage.getItem.mockReturnValue(null); 

    renderWithContext(
      <ProtectedRoute requiredUserType="player">
        <div>Protected Content</div>
      </ProtectedRoute>,
      authValue,
      '/player/dashboard'
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Player Login Page')).toBeInTheDocument();
  });

  it('shows loading spinner when auth data exists but context is not loaded', () => {
    const authValue = { user: null, userType: null };
    // Mock that token and user exist in storage
    secureStorage.getItem.mockImplementation((key) => {
      if (key.includes('token')) return 'valid-token';
      if (key.includes('user')) return '{"id":1}';
      return null;
    });
    tokenUtils.isTokenExpired.mockReturnValue(false);

    const { container } = renderWithContext(
      <ProtectedRoute requiredUserType="admin">
        <div>Protected Content</div>
      </ProtectedRoute>,
      authValue
    );

    // Should show spinner (check for animate-spin class)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('removes expired token from storage and redirects', () => {
    const authValue = { user: null, userType: null };
    secureStorage.getItem.mockImplementation((key) => {
      if (key.includes('token')) return 'expired-token';
      if (key.includes('user')) return '{"id":1}';
      return null;
    });
    tokenUtils.isTokenExpired.mockReturnValue(true); // Token is expired!

    renderWithContext(
      <ProtectedRoute requiredUserType="admin">
        <div>Protected Content</div>
      </ProtectedRoute>,
      authValue
    );

    expect(secureStorage.removeItem).toHaveBeenCalledWith('admin_token');
    expect(secureStorage.removeItem).toHaveBeenCalledWith('admin_user');
    
    // Once removed, it should fall through to the login redirect
    // (In actual flow, the component rerenders without token, falling to login)
  });
});
