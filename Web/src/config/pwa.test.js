import { describe, expect, it } from 'vitest';
import { pwaWorkboxConfig } from './pwa';

describe('pwa workbox configuration', () => {
  it('includes offline navigation fallback', () => {
    expect(pwaWorkboxConfig.navigateFallback).toBe('index.html');
  });

  it('uses cache-first strategy for static assets', () => {
    const staticRule = pwaWorkboxConfig.runtimeCaching.find(
      (rule) => rule.handler === 'CacheFirst'
    );
    expect(staticRule).toBeDefined();
  });

  it('uses network-first strategy with cache fallback for API calls', () => {
    const apiRule = pwaWorkboxConfig.runtimeCaching.find(
      (rule) => rule.handler === 'NetworkFirst' && rule.options?.cacheName === 'api-cache'
    );

    expect(apiRule).toBeDefined();
    expect(apiRule.options.networkTimeoutSeconds).toBe(8);
  });

  it('has dedicated runtime cache for navigation requests', () => {
    const navigationRule = pwaWorkboxConfig.runtimeCaching.find(
      (rule) => rule.handler === 'NetworkFirst' && rule.options?.cacheName === 'navigation-cache'
    );
    expect(navigationRule).toBeDefined();
  });
});
