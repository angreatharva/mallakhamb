// Centralized error handling
import toast from 'react-hot-toast';

export const handleAPIError = (error, customMessage = null) => {
  // Network error
  if (!error.response) {
    toast.error(customMessage || 'Network error. Please check your connection.');
    return {
      type: 'network',
      message: 'Network error',
    };
  }

  // HTTP error
  const status = error.response.status;
  const message = error.response.data?.message || error.message;

  switch (status) {
    case 400:
      toast.error(customMessage || message || 'Invalid request');
      break;
    case 401:
      toast.error('Session expired. Please login again.');
      break;
    case 403:
      toast.error(customMessage || 'Access denied');
      break;
    case 404:
      toast.error(customMessage || 'Resource not found');
      break;
    case 429:
      toast.error('Too many requests. Please try again later.');
      break;
    case 500:
    case 502:
    case 503:
      toast.error('Server error. Please try again later.');
      break;
    default:
      toast.error(customMessage || message || 'An error occurred');
  }

  return {
    type: 'http',
    status,
    message,
  };
};
