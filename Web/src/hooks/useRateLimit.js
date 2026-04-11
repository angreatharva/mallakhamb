// Client-side rate limiting hook
import { useState, useCallback } from 'react';

export const useRateLimit = (maxAttempts = 5, windowMs = 60000) => {
  const [attempts, setAttempts] = useState([]);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    const recentAttempts = attempts.filter((time) => now - time < windowMs);

    if (recentAttempts.length >= maxAttempts) {
      const oldestAttempt = Math.min(...recentAttempts);
      const waitTime = Math.ceil((windowMs - (now - oldestAttempt)) / 1000);
      return { allowed: false, waitTime };
    }

    return { allowed: true, waitTime: 0 };
  }, [attempts, maxAttempts, windowMs]);

  const recordAttempt = useCallback(() => {
    setAttempts((prev) => [...prev, Date.now()]);
  }, []);

  const reset = useCallback(() => {
    setAttempts([]);
  }, []);

  return { checkRateLimit, recordAttempt, reset };
};
