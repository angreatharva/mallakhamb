import { describe, expect, it } from 'vitest';
import { MAX_RETRIES, getRetryDelay, shouldRetry } from './retryLogic.js';

function buildError({ status, code } = {}) {
  const error = new Error('request failed');
  if (typeof status === 'number') {
    error.response = { status };
  }
  if (code) {
    error.code = code;
  }
  return error;
}

describe('retryLogic utilities', () => {
  it('retries network and 5xx errors only within max retries', () => {
    expect(shouldRetry(buildError(), 0, MAX_RETRIES)).toBe(true);
    expect(shouldRetry(buildError({ status: 500 }), 1, MAX_RETRIES)).toBe(true);
    expect(shouldRetry(buildError({ status: 429 }), 0, MAX_RETRIES)).toBe(false);
    expect(shouldRetry(buildError({ status: 404 }), 0, MAX_RETRIES)).toBe(false);
    expect(shouldRetry(buildError({ code: 'ERR_CANCELED' }), 0, MAX_RETRIES)).toBe(false);
    expect(shouldRetry(buildError({ status: 503 }), MAX_RETRIES, MAX_RETRIES)).toBe(false);
  });

  it('calculates exponential backoff with max cap', () => {
    expect(getRetryDelay(1, 100, 5000)).toBe(100);
    expect(getRetryDelay(2, 100, 5000)).toBe(200);
    expect(getRetryDelay(3, 100, 5000)).toBe(400);
    expect(getRetryDelay(6, 100, 500)).toBe(500);
  });
});
