// API Configuration utility - uses VITE_API_URL from .env
import { logger } from './logger.js';

class ApiConfig {
  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    logger.log('🔗 API Base URL:', this.baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  isUsingNgrok() {
    return this.baseUrl.includes('ngrok');
  }

  // Get headers with ngrok-skip-browser-warning if using ngrok
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.isUsingNgrok()) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }

    return headers;
  }

  // Initialize method for compatibility (no longer needed)
  async initialize() {
    return this.baseUrl;
  }
}

// Create singleton instance
const apiConfig = new ApiConfig();

export default apiConfig;
