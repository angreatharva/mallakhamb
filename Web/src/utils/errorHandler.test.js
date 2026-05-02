import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAPIError, getAccountLockoutInfo } from './errorHandler.js';
import toast from 'react-hot-toast';
import { logger } from './logger.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('./logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── handleAPIError ──────────────────────────────────────────────────────────

  describe('handleAPIError', () => {
    // ── Network errors ────────────────────────────────────────────────────────

    describe('Network errors', () => {
      it('handles network errors with connection message', () => {
        const error = {
          message: 'Network Error',
        };

        const result = handleAPIError(error, 'Login');

        expect(logger.error).toHaveBeenCalledWith('Login error:', error);
        expect(toast.error).toHaveBeenCalledWith('Network error. Please check your connection.');
        expect(result).toEqual({
          type: 'network',
          message: 'Network error. Please check your connection.',
        });
      });

      it('logs error to console for debugging', () => {
        const error = {
          message: 'Network Error',
        };

        handleAPIError(error, 'Save Score');

        expect(logger.error).toHaveBeenCalledWith('Save Score error:', error);
      });
    });

    // ── 400 Validation errors ─────────────────────────────────────────────────

    describe('400 Validation errors', () => {
      it('handles validation errors with field-specific messages', () => {
        const error = {
          response: {
            status: 400,
            data: {
              message: 'Validation failed',
              errors: [
                { field: 'email', message: 'Invalid email format' },
                { field: 'password', message: 'Password too short' },
              ],
            },
          },
        };

        const result = handleAPIError(error, 'Registration');

        expect(toast.error).toHaveBeenCalledWith('email: Invalid email format');
        expect(toast.error).toHaveBeenCalledWith('password: Password too short');
        expect(result.status).toBe(400);
      });

      it('handles validation errors without field names', () => {
        const error = {
          response: {
            status: 400,
            data: {
              message: 'Validation failed',
              errors: [
                { message: 'Invalid request data' },
              ],
            },
          },
        };

        handleAPIError(error, 'Update');

        expect(toast.error).toHaveBeenCalledWith('Invalid request data');
      });

      it('handles 400 errors without errors array', () => {
        const error = {
          response: {
            status: 400,
            data: {
              message: 'Bad request',
            },
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Bad request');
      });
    });

    // ── 401 Authentication errors ─────────────────────────────────────────────

    describe('401 Authentication errors', () => {
      it('handles 401 errors with redirect message', () => {
        const error = {
          response: {
            status: 401,
            data: {
              message: 'Unauthorized',
            },
          },
        };

        const result = handleAPIError(error, 'API Call');

        expect(toast.error).toHaveBeenCalledWith('Session expired. Please login again.');
        expect(result.status).toBe(401);
      });
    });

    // ── 403 Authorization errors ──────────────────────────────────────────────

    describe('403 Authorization errors', () => {
      it('handles 403 errors with competition context message', () => {
        const error = {
          response: {
            status: 403,
            data: {
              message: 'Invalid competition context',
            },
          },
        };

        handleAPIError(error, 'Score Save');

        expect(toast.error).toHaveBeenCalledWith('Competition context error. Please select a competition.');
      });

      it('handles 403 errors with generic permission message', () => {
        const error = {
          response: {
            status: 403,
            data: {
              message: 'Access denied',
            },
          },
        };

        handleAPIError(error, 'Admin Action');

        expect(toast.error).toHaveBeenCalledWith('You do not have permission to perform this action.');
      });

      it('detects competition context errors case-insensitively', () => {
        const error = {
          response: {
            status: 403,
            data: {
              message: 'Competition not found',
            },
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Competition context error. Please select a competition.');
      });
    });

    // ── 429 Rate limiting errors ──────────────────────────────────────────────

    describe('429 Rate limiting errors', () => {
      it('handles 429 errors with wait time', () => {
        const error = {
          response: {
            status: 429,
            data: {
              message: 'Too many requests',
              retryAfter: 900, // 15 minutes
            },
          },
        };

        handleAPIError(error, 'Login');

        expect(toast.error).toHaveBeenCalledWith('Too many requests. Please wait 15 minutes.');
      });

      it('uses default wait time when retryAfter not provided', () => {
        const error = {
          response: {
            status: 429,
            data: {
              message: 'Too many requests',
            },
          },
        };

        handleAPIError(error, 'Login');

        expect(toast.error).toHaveBeenCalledWith('Too many requests. Please wait 15 minutes.');
      });

      it('rounds up wait time to nearest minute', () => {
        const error = {
          response: {
            status: 429,
            data: {
              message: 'Too many requests',
              retryAfter: 90, // 1.5 minutes
            },
          },
        };

        handleAPIError(error, 'Login');

        expect(toast.error).toHaveBeenCalledWith('Too many requests. Please wait 2 minutes.');
      });
    });

    // ── 500 Server errors ─────────────────────────────────────────────────────

    describe('500 Server errors', () => {
      it('handles 500 errors with generic message', () => {
        const error = {
          response: {
            status: 500,
            data: {
              message: 'Internal server error',
            },
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Server error. Please try again later.');
      });

      it('handles 502 errors', () => {
        const error = {
          response: {
            status: 502,
            data: {},
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Server error. Please try again later.');
      });

      it('handles 503 errors', () => {
        const error = {
          response: {
            status: 503,
            data: {},
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Server error. Please try again later.');
      });
    });

    // ── Other errors ──────────────────────────────────────────────────────────

    describe('Other errors', () => {
      it('handles unknown status codes with message from response', () => {
        const error = {
          response: {
            status: 418,
            data: {
              message: "I'm a teapot",
            },
          },
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith("I'm a teapot");
      });

      it('handles errors without message', () => {
        const error = {
          response: {
            status: 404,
            data: {},
          },
          message: 'Not found',
        };

        handleAPIError(error, 'Request');

        expect(toast.error).toHaveBeenCalledWith('Not found');
      });
    });

    // ── Return values ─────────────────────────────────────────────────────────

    describe('Return values', () => {
      it('returns error details for HTTP errors', () => {
        const error = {
          response: {
            status: 400,
            data: {
              message: 'Bad request',
            },
          },
        };

        const result = handleAPIError(error, 'Request');

        expect(result).toEqual({
          type: 'http',
          status: 400,
          message: 'Bad request',
          data: {
            message: 'Bad request',
          },
        });
      });

      it('returns error details for network errors', () => {
        const error = {
          message: 'Network Error',
        };

        const result = handleAPIError(error, 'Request');

        expect(result).toEqual({
          type: 'network',
          message: 'Network error. Please check your connection.',
        });
      });
    });
  });

  // ── getAccountLockoutInfo ───────────────────────────────────────────────────

  describe('getAccountLockoutInfo', () => {
    it('returns lockout info for account lockout errors', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Account locked due to too many failed attempts',
            lockoutDuration: 900,
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeTruthy();
      expect(result.isLocked).toBe(true);
      expect(result.duration).toBe(900);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.message).toBe('Account locked due to too many failed attempts');
    });

    it('returns lockout info with retryAfter when lockoutDuration not provided', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Account lockout',
            retryAfter: 600,
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeTruthy();
      expect(result.duration).toBe(600);
    });

    it('uses default duration when neither lockoutDuration nor retryAfter provided', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Account locked',
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeTruthy();
      expect(result.duration).toBe(900); // 15 minutes default
    });

    it('calculates correct endTime', () => {
      const now = Date.now();
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Account locked',
            lockoutDuration: 300, // 5 minutes
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result.endTime.getTime()).toBeGreaterThanOrEqual(now + 300 * 1000);
      expect(result.endTime.getTime()).toBeLessThanOrEqual(now + 300 * 1000 + 100); // Allow 100ms tolerance
    });

    it('returns null for non-429 errors', () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Bad request',
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeNull();
    });

    it('returns null for 429 errors without lockout message', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Too many requests',
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeNull();
    });

    it('returns null for errors without response', () => {
      const error = {
        message: 'Network Error',
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeNull();
    });

    it('detects lockout message case-insensitively', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'ACCOUNT LOCKED',
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeTruthy();
      expect(result.isLocked).toBe(true);
    });

    it('detects lockout keyword in message', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'User lockout in effect',
          },
        },
      };

      const result = getAccountLockoutInfo(error);

      expect(result).toBeTruthy();
      expect(result.isLocked).toBe(true);
    });
  });
});
