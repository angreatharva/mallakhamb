import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiConfig from '@/config/api.config.js';
import { isTokenExpired, getCompetitionIdFromToken } from '@/utils/auth/tokenUtils.js';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { apiCache } from '@/utils/data/apiCache.js';
import { logger } from '@/infrastructure/logger.js';

logger.log('🏠 Using API URL:', apiConfig.getBaseUrl());

export const api = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

export const publicApi = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
});

const getCurrentUserTypeFromURL = () => {
  const path = window.location.pathname;
  if (path.startsWith('/player')) return 'player';
  if (path.startsWith('/coach')) return 'coach';
  if (path.startsWith('/judge')) return 'judge';
  if (path.startsWith('/superadmin')) return 'superadmin';
  if (path.startsWith('/admin')) return 'admin';
  return null;
};

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
        return Promise.reject({
          config,
          response: { data: cached },
          cached: true
        });
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

      window.location.href = '/';
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
    if (response.config.method === 'get' && !response.config.skipCache) {
      apiCache.set(response.config.url, response.config.params, response.data);
    }
    return response;
  },
  (error) => {
    if (error.cached) {
      return Promise.resolve(error.response);
    }

    if (error.response?.status === 401) {
      const currentType = getCurrentUserTypeFromURL();

      if (currentType) {
        secureStorage.removeItem(`${currentType}_token`);
        secureStorage.removeItem(`${currentType}_user`);
      }

      secureStorage.removeItem('token');
      secureStorage.removeItem('user');
      secureStorage.removeItem('userType');

      window.location.href = '/';
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
            window.location.href = `/${currentType}/login`;
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
