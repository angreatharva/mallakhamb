// API Configuration utility - uses VITE_API_URL from .env
import { logger } from '@/infrastructure/logger.js';

class ApiConfig {
  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    logger.log('🔗 API Base URL:', this.baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  // Socket.IO server origin: the base URL minus its TRAILING /api path.
  // A plain .replace('/api', '') hits the first "/api", which for an
  // api.<domain> host is inside "//api." and yields "https:/.<domain>/api".
  getSocketUrl() {
    return this.baseUrl.replace(/\/api\/?$/, '');
  }

  isUsingNgrok() {
    return this.baseUrl.includes('ngrok');
  }

  // Get headers with ngrok-skip-browser-warning if using ngrok
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
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