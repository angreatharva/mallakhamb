// Centralized error handling
import toast from 'react-hot-toast';
import { logger } from './logger.js';

/**
 * Centralized API error handler utility
 * Handles different error types and provides user feedback
 * 
 * @param {Error} error - The error object from API request
 * @param {string} context - Context description for logging (e.g., 'Login', 'Save Score')
 * @returns {Object} Error details with type, status, and message
 */
export const handleAPIError = (error, context = 'API Request') => {
  // Log all API errors to console for debugging (Requirement 9.7)
  logger.error(`${context} error:`, error);

  // Network error (Requirement 9.6)
  if (!error.response) {
    toast.error('Network error. Please check your connection.');
    return {
      type: 'network',
      message: 'Network error. Please check your connection.'
    };
  }
  
  // HTTP error
  const { status, data } = error.response;
  const message = data?.message || error.message;
  
  switch (status) {
    case 400: {
      // Handle validation errors with field-specific messages (Requirement 9.4)
      if (data.errors && Array.isArray(data.errors)) {
        data.errors.forEach((err) => {
          const fieldMessage = err.field ? `${err.field}: ${err.message}` : err.message;
          toast.error(fieldMessage);
        });
      } else {
        toast.error(message || 'Invalid request');
      }
      break;
    }
    
    case 401:
      // Handle authentication errors with redirect (Requirement 9.1)
      toast.error('Session expired. Please login again.');
      // Redirect is handled by the axios interceptor in api.js
      break;
    
    case 403: {
      // Handle authorization errors (Requirement 9.2)
      if (message?.toLowerCase().includes('competition')) {
        toast.error('Competition context error. Please select a competition.');
      } else {
        toast.error('You do not have permission to perform this action.');
      }
      // Competition context redirect is handled by response interceptor in api.js
      break;
    }
    
    case 429: {
      // Handle rate limiting errors with wait time (Requirement 9.3)
      const waitTime = data.retryAfter || 900; // 15 minutes default
      const waitMinutes = Math.ceil(waitTime / 60);
      toast.error(`Too many requests. Please wait ${waitMinutes} minutes.`);
      break;
    }
    
    case 500:
    case 502:
    case 503:
      // Handle server errors with generic message (Requirement 9.6)
      toast.error('Server error. Please try again later.');
      break;
    
    default:
      toast.error(message || 'An error occurred');
  }
  
  return {
    type: 'http',
    status,
    message,
    data
  };
};

/**
 * Check if error is an account lockout error
 * 
 * @param {Error} error - The error object from API request
 * @returns {Object|null} Lockout details with duration and endTime, or null if not a lockout error
 */
export const getAccountLockoutInfo = (error) => {
  if (!error.response || error.response.status !== 429) {
    return null;
  }

  const { data } = error.response;
  const message = data?.message || '';
  
  // Check if this is an account lockout error (Requirement 9.5)
  if (message.toLowerCase().includes('locked') || message.toLowerCase().includes('lockout')) {
    const lockoutDuration = data.lockoutDuration || data.retryAfter || 900; // 15 minutes default
    const lockoutEndTime = new Date(Date.now() + lockoutDuration * 1000);
    
    return {
      isLocked: true,
      duration: lockoutDuration,
      endTime: lockoutEndTime,
      message
    };
  }
  
  return null;
};
