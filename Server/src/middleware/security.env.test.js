/**
 * Tests for environment-specific security settings
 * Requirements: 23.1, 23.4, 23.6
 */

const { getRateLimitConfig, RATE_LIMIT_CONFIG } = require('./security.middleware');

// ---------------------------------------------------------------------------
// getRateLimitConfig
// ---------------------------------------------------------------------------

describe('getRateLimitConfig (Requirement 23.6)', () => {
  it('returns stricter limits for production than development', () => {
    const prod = getRateLimitConfig('production', 'general');
    const dev = getRateLimitConfig('development', 'general');

    // Production should have a lower max (stricter)
    expect(prod.max).toBeLessThan(dev.max);
  });

  it('returns stricter auth limits than general limits in production', () => {
    const general = getRateLimitConfig('production', 'general');
    const auth = getRateLimitConfig('production', 'auth');

    expect(auth.max).toBeLessThan(general.max);
  });

  it('returns development limits for development environment', () => {
    const config = getRateLimitConfig('development', 'general');
    expect(config.max).toBe(RATE_LIMIT_CONFIG.development.general.max);
    expect(config.windowMs).toBe(RATE_LIMIT_CONFIG.development.general.windowMs);
  });

  it('returns production limits for production environment', () => {
    const config = getRateLimitConfig('production', 'general');
    expect(config.max).toBe(RATE_LIMIT_CONFIG.production.general.max);
  });

  it('returns staging limits for staging environment', () => {
    const config = getRateLimitConfig('staging', 'general');
    expect(config.max).toBe(RATE_LIMIT_CONFIG.staging.general.max);
  });

  it('falls back to development config for unknown environments', () => {
    const config = getRateLimitConfig('unknown', 'general');
    expect(config.max).toBe(RATE_LIMIT_CONFIG.development.general.max);
  });

  it('returns test limits for test environment', () => {
    const config = getRateLimitConfig('test', 'general');
    expect(config.max).toBe(RATE_LIMIT_CONFIG.test.general.max);
    // Test limits should be very permissive
    expect(config.max).toBeGreaterThanOrEqual(1000);
  });

  it('all environments have windowMs and max defined', () => {
    const envs = ['production', 'staging', 'development', 'test'];
    const types = ['general', 'auth', 'user'];

    for (const env of envs) {
      for (const type of types) {
        const config = getRateLimitConfig(env, type);
        expect(typeof config.windowMs).toBe('number');
        expect(typeof config.max).toBe('number');
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.max).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// RATE_LIMIT_CONFIG structure
// ---------------------------------------------------------------------------

describe('RATE_LIMIT_CONFIG structure', () => {
  it('has entries for all required environments', () => {
    expect(RATE_LIMIT_CONFIG).toHaveProperty('production');
    expect(RATE_LIMIT_CONFIG).toHaveProperty('staging');
    expect(RATE_LIMIT_CONFIG).toHaveProperty('development');
    expect(RATE_LIMIT_CONFIG).toHaveProperty('test');
  });

  it('each environment has general, auth, and user limit types', () => {
    for (const env of Object.keys(RATE_LIMIT_CONFIG)) {
      expect(RATE_LIMIT_CONFIG[env]).toHaveProperty('general');
      expect(RATE_LIMIT_CONFIG[env]).toHaveProperty('auth');
      expect(RATE_LIMIT_CONFIG[env]).toHaveProperty('user');
    }
  });

  it('production general limit is 100 req per 15 minutes', () => {
    expect(RATE_LIMIT_CONFIG.production.general.max).toBe(100);
    expect(RATE_LIMIT_CONFIG.production.general.windowMs).toBe(15 * 60 * 1000);
  });

  it('production auth limit is 10 req per 15 minutes', () => {
    expect(RATE_LIMIT_CONFIG.production.auth.max).toBe(10);
    expect(RATE_LIMIT_CONFIG.production.auth.windowMs).toBe(15 * 60 * 1000);
  });

  it('development general limit is 1000 req per minute', () => {
    expect(RATE_LIMIT_CONFIG.development.general.max).toBe(1000);
    expect(RATE_LIMIT_CONFIG.development.general.windowMs).toBe(60 * 1000);
  });
});
