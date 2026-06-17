import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiConfig from '@/config/api.config.js';
import { isTokenExpired, getCompetitionIdFromToken } from '@/utils/auth/tokenUtils.js';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { apiCache } from '@/utils/data/apiCache.js';
import { logger } from '@/infrastructure/logger.js';
import { dispatchAuthExpired } from '@/utils/auth/authEvents.js';

logger.log('🏠 Using API URL:', apiConfig.getBaseUrl());

export const api = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

export const publicApi = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

import { getRoleFromPath } from '@/utils/auth/roleFromPath.js';

const getCurrentUserTypeFromURL = () => getRoleFromPath(window.location.pathname);

const getToken = (userType) => {
  if (userType) {
    return secureStorage.getItem(`${userType}_token`);
  }
  return secureStorage.getItem('token');
};

api.interceptors.request.use(
  (config) => {
    if (config.method === 'get' && !config.skipCache) {
      const cached = apiCache.get(config.url, config.params);
      if (cached) {
        config.adapter = () => Promise.resolve({
          data: cached,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {}
        });
        return config;
      }
    }

    const currentType = getCurrentUserTypeFromURL();
    let token = getToken(currentType);

    if (token && isTokenExpired(token)) {
      if (currentType) {
        secureStorage.removeItem(`${currentType}_token`);
        secureStorage.removeItem(`${currentType}_user`);
      }
      secureStorage.removeItem('token');
      secureStorage.removeItem('user');

      dispatchAuthExpired({ userType: currentType, reason: 'token_expired' });
      return Promise.reject(new Error('Token expired'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;

      const competitionId = getCompetitionIdFromToken(token);
      if (competitionId) {
        config.headers['x-competition-id'] = competitionId;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    // --- Token Rotation (X-New-Token header) ---
    // The server rotates tokens that are older than the rotation threshold
    // and sends the new token in the X-New-Token response header.
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType) {
        secureStorage.setItem(`${currentType}_token`, newToken);
        logger.log(`🔄 Token rotated for ${currentType}`);
      }
    }

    if (response.config.method === 'get' && !response.config.skipCache) {
      apiCache.set(response.config.url, response.config.params, response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const currentType = getCurrentUserTypeFromURL();

      if (currentType) {
        secureStorage.removeItem(`${currentType}_token`);
        secureStorage.removeItem(`${currentType}_user`);
      }

      secureStorage.removeItem('token');
      secureStorage.removeItem('user');
      secureStorage.removeItem('userType');

      dispatchAuthExpired({ userType: currentType, reason: 'unauthorized_401' });
    } else if (error.response?.status === 403) {
      const errorMessage = error.response?.data?.message || '';

      if (errorMessage.includes('competition') || errorMessage.includes('Competition')) {
        const currentType = getCurrentUserTypeFromURL();

        if (currentType) {
          const token = getToken(currentType);

          let isSuperAdmin = false;
          if (token) {
            try {
              const decoded = jwtDecode(token);
              isSuperAdmin = decoded.role === 'superadmin';
            } catch (err) {
              logger.error('Error decoding token:', err);
            }
          }

          if (!isSuperAdmin) {
            logger.warn('Competition context invalid, redirecting non-superadmin user to competition selection');
            dispatchAuthExpired({ userType: currentType, reason: 'competition_context_invalid' });
          } else {
            logger.warn('Competition context error for superadmin, but not redirecting');
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
