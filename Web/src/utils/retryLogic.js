import axios from 'axios';

export const MAX_RETRIES = 3;

export function shouldRetry(error, retryCount = 0, maxRetries = MAX_RETRIES) {
  if (!error || retryCount >= maxRetries) {
    return false;
  }

  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
    return false;
  }

  if (error.response) {
    const { status } = error.response;
    return status >= 500 && status < 600;
  }

  // Network errors typically do not include a response object.
  return true;
}

export function getRetryDelay(attempt, baseDelayMs = 300, maxDelayMs = 5000) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const exponentialDelay = baseDelayMs * 2 ** (safeAttempt - 1);
  return Math.min(exponentialDelay, maxDelayMs);
}
