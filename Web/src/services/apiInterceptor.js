import axios from 'axios';
import { logger } from '../utils/logger.js';
import { MAX_RETRIES, getRetryDelay, shouldRetry } from '../utils/retryLogic.js';

const DEFAULT_RETRY_CONFIG = {
  maxRetries: MAX_RETRIES,
  baseDelayMs: 300,
  maxDelayMs: 5000,
};

export function createRetryConfig(overrides = {}) {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...overrides,
  };
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new axios.CanceledError('Request canceled before retry.'));
      return;
    }

    const timeoutId = setTimeout(() => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve();
    }, delayMs);

    const abortHandler = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);
      reject(new axios.CanceledError('Request canceled during retry backoff.'));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });
  });
}

export function setupInterceptors(apiInstance, options = {}) {
  const retryConfig = createRetryConfig(options.retryConfig);
  const activeLogger = options.logger || logger;

  apiInstance.interceptors.request.use((config) => {
    const nextConfig = config;
    nextConfig.metadata = {
      ...nextConfig.metadata,
      startTime: Date.now(),
      retryCount: nextConfig.__retryCount || 0,
    };
    return nextConfig;
  });

  apiInstance.interceptors.response.use(
    (response) => {
      const startedAt = response.config?.metadata?.startTime;
      if (startedAt) {
        const durationMs = Date.now() - startedAt;
        activeLogger.info(
          '[API] Request completed',
          response.config?.method?.toUpperCase(),
          response.config?.url,
          `${durationMs}ms`
        );
      }
      return response;
    },
    async (error) => {
      const config = error?.config;
      if (!config) {
        return Promise.reject(error);
      }

      const retryCount = config.__retryCount || 0;
      if (!shouldRetry(error, retryCount, retryConfig.maxRetries)) {
        return Promise.reject(error);
      }

      const nextRetryCount = retryCount + 1;
      config.__retryCount = nextRetryCount;
      config.metadata = {
        ...config.metadata,
        retryCount: nextRetryCount,
      };

      const delayMs = getRetryDelay(
        nextRetryCount,
        retryConfig.baseDelayMs,
        retryConfig.maxDelayMs
      );

      activeLogger.warn(
        '[API] Retrying request',
        config.method?.toUpperCase(),
        config.url,
        `attempt ${nextRetryCount}/${retryConfig.maxRetries}`,
        `delay ${delayMs}ms`,
        `status ${error.response?.status ?? 'NETWORK_ERROR'}`
      );

      await waitForRetry(delayMs, config.signal);
      return apiInstance(config);
    }
  );
}
