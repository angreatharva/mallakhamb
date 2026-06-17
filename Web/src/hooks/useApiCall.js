import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';

/**
 * Unified API call hook with consistent error handling
 * 
 * @example
 * const { execute, loading, error } = useApiCall();
 * 
 * const fetchData = async () => {
 *   const result = await execute(() => api.getData());
 *   if (result) {
 *     // Handle success
 *   }
 * };
 */
export const useApiCall = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Handle API errors consistently
   */
  const handleError = useCallback((err) => {
    // Extract error message
    const message = 
      err.response?.data?.message || 
      err.response?.data?.error ||
      err.message || 
      'An unexpected error occurred';
    
    // Log error for debugging
    logger.error('API Error:', {
      message,
      status: err.response?.status,
      url: err.config?.url,
      method: err.config?.method,
    });
    
    // Show user-friendly error message
    toast.error(message);
    
    // Report to error tracking service in production
    if (import.meta.env.PROD && window.Sentry) {
      window.Sentry.captureException(err, {
        tags: {
          type: 'api_error',
          status: err.response?.status,
        },
        extra: {
          url: err.config?.url,
          method: err.config?.method,
        },
      });
    }
    
    return message;
  }, []);

  /**
   * Execute API call with error handling
   */
  const execute = useCallback(async (apiCall) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall();
      return result;
    } catch (err) {
      setError(err);
      handleError(err);
      throw err; // Re-throw for component-level handling if needed
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  /**
   * Execute API call with loading state management (for custom loading state)
   */
  const executeWithLoading = useCallback(async (apiCall, customSetLoading) => {
    customSetLoading(true);
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall();
      return result;
    } catch (err) {
      setError(err);
      handleError(err);
      throw err;
    } finally {
      customSetLoading(false);
      setLoading(false);
    }
  }, [handleError]);

  return { 
    execute, 
    executeWithLoading,
    handleError,
    loading,
    error,
  };
};

export default useApiCall;
