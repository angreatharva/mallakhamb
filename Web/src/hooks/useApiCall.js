import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';

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
  /**
   * Handle API errors consistently
   */
  const handleError = useCallback((error) => {
    // Extract error message
    const message = 
      error.response?.data?.message || 
      error.response?.data?.error ||
      error.message || 
      'An unexpected error occurred';
    
    // Log error for debugging
    logger.error('API Error:', {
      message,
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
    });
    
    // Show user-friendly error message
    toast.error(message);
    
    // Report to error tracking service in production
    if (import.meta.env.PROD && window.Sentry) {
      window.Sentry.captureException(error, {
        tags: {
          type: 'api_error',
          status: error.response?.status,
        },
        extra: {
          url: error.config?.url,
          method: error.config?.method,
        },
      });
    }
    
    return message;
  }, []);

  /**
   * Execute API call with error handling
   */
  const execute = useCallback(async (apiCall) => {
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      handleError(error);
      throw error; // Re-throw for component-level handling if needed
    }
  }, [handleError]);

  /**
   * Execute API call with loading state management
   */
  const executeWithLoading = useCallback(async (apiCall, setLoading) => {
    setLoading(true);
    try {
      const result = await execute(apiCall);
      return result;
    } finally {
      setLoading(false);
    }
  }, [execute]);

  return { 
    execute, 
    executeWithLoading,
    handleError,
  };
};

export default useApiCall;
