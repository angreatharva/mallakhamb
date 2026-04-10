/**
 * Test Helpers for Pages Accessibility Testing
 *
 * Provides utility functions and mock providers for testing pages
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../App';

/**
 * Mock AuthContext Provider for testing
 */
export const MockAuthProvider = ({ children, value = {} }) => {
  const defaultValue = {
    user: null,
    token: null,
    role: null,
    login: () => Promise.resolve(),
    logout: () => {},
    isAuthenticated: false,
    ...value,
  };

  return <AuthContext.Provider value={defaultValue}>{children}</AuthContext.Provider>;
};

/**
 * Render component with Router and AuthProvider
 */
export const renderWithProviders = (component, { initialRoute = '/', authValue = {} } = {}) => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <MockAuthProvider value={authValue}>{component}</MockAuthProvider>
    </MemoryRouter>
  );
};

/**
 * Render component with Router (simplified API for route-only tests)
 */
export const renderWithRouter = (component, route = '/') => {
  return renderWithProviders(component, { initialRoute: route });
};

/**
 * Mock matchMedia for reduced motion testing
 */
export const mockMatchMedia = (matches = false) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
};

/**
 * Wait for async operations to complete
 */
export const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 0));
