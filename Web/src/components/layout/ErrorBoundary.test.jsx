/**
 * The crash screen says what broke, in every build: production drops every
 * console call, so "Technical details" is the only place a person reporting a
 * crash can read the error.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const Boom = () => {
  throw new TypeError("Cannot read properties of null (reading 'toLowerCase')");
};

describe('ErrorBoundary', () => {
  it('shows the error under Technical details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary homePath="/judge/dashboard"><Boom /></ErrorBoundary>);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    expect(screen.getByTestId('error-details').textContent)
      .toContain("TypeError: Cannot read properties of null (reading 'toLowerCase')");
  });
});
