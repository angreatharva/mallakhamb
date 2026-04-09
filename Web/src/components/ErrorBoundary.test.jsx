import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ErrorBoundary from './ErrorBoundary'
import { logger } from '../utils/logger'

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

const ThrowError = () => {
  throw new Error('Crash in component')
}

describe('ErrorBoundary', () => {
  const originalError = console.error

  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    vi.clearAllMocks()
  })

  it('catches render errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Page' })).toBeInTheDocument()
  })

  it('logs structured error details with required context', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )

    expect(logger.error).toHaveBeenCalledWith(
      'ErrorBoundary captured a runtime error',
      expect.objectContaining({
        timestamp: expect.any(String),
        url: expect.any(String),
        userAgent: expect.any(String),
        message: 'Crash in component',
        stack: expect.any(String),
        componentStack: expect.any(String),
      }),
    )
  })

  it('attempts recovery when user clicks try again', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Try Again' }))

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
