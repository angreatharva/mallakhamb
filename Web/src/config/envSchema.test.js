import { describe, expect, it } from 'vitest';
import { validateEnv } from './envSchema';

describe('environment validation', () => {
  it('succeeds with valid environment values', () => {
    const result = validateEnv({
      VITE_API_URL: 'https://api.example.com',
      VITE_ENABLE_PWA: 'true',
      VITE_ENABLE_I18N: 'false',
      VITE_ANALYTICS_ID: 'G-ABC123',
      VITE_SENTRY_DSN: 'https://dsn.example.com/123',
      DEV: false,
    });

    expect(result).toEqual({
      VITE_API_URL: 'https://api.example.com',
      VITE_ENABLE_PWA: true,
      VITE_ENABLE_I18N: false,
      VITE_ANALYTICS_ID: 'G-ABC123',
      VITE_SENTRY_DSN: 'https://dsn.example.com/123',
    });
  });

  it('fails when required variables are missing', () => {
    expect(() =>
      validateEnv({
        VITE_ENABLE_PWA: 'true',
        DEV: false,
      })
    ).toThrow(/VITE_API_URL is required/);
  });

  it('fails when feature flags have invalid types', () => {
    expect(() =>
      validateEnv({
        VITE_API_URL: 'https://api.example.com',
        VITE_ENABLE_PWA: 123,
        DEV: false,
      })
    ).toThrow(/VITE_ENABLE_PWA/);
  });

  it('fails when API URL is not a valid URL', () => {
    expect(() =>
      validateEnv({
        VITE_API_URL: 'not-a-url',
        DEV: false,
      })
    ).toThrow(/VITE_API_URL must be a valid URL/);
  });
});
