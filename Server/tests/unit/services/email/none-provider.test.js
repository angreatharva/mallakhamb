/**
 * EMAIL_PROVIDER=none (deploy/oci/PLAN.md O14): the nightly lifecycle check
 * registers a whole season on a throw-away database, and no email may leave
 * the server. The provider must send nothing, and the config must refuse it
 * on any production database that isn't a throw-away "_e2e" one.
 */
const EmailService = require('../../../../src/services/email/email.service');
const NoneAdapter = require('../../../../src/services/email/none.adapter');
const configManager = require('../../../../src/config/config-manager');

const ConfigManager = configManager.constructor;
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('NoneAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is what EmailService builds for EMAIL_PROVIDER=none', () => {
    const service = new EmailService({ get: (key) => ({ 'email.provider': 'none' }[key]) }, logger);
    expect(service.provider).toBeInstanceOf(NoneAdapter);
  });

  it('reports success, logs recipient and subject only, and never the body', async () => {
    const adapter = new NoneAdapter(null, logger);
    const result = await adapter.sendEmail({ to: 'judge@example.com', subject: 'Your OTP', text: 'OTP 123456', html: '<b>123456</b>' });

    expect(result).toEqual({ success: true, messageId: 'none-1', provider: 'none' });
    expect(logger.info).toHaveBeenCalledWith('Email suppressed (EMAIL_PROVIDER=none)', { to: 'judge@example.com', subject: 'Your OTP' });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('123456');
  });

  it('sends through EmailService without touching any real provider', async () => {
    const service = new EmailService({ get: (key) => ({ 'email.provider': 'none' }[key]) }, logger);
    await expect(service.sendEmail({ to: 'coach@example.com', subject: 'Welcome', text: 'hi' }))
      .resolves.toMatchObject({ success: true, provider: 'none' });
    await expect(service.checkHealth()).resolves.toMatchObject({ healthy: true, provider: 'none' });
  });
});

describe('ConfigManager and EMAIL_PROVIDER=none', () => {
  const saved = { ...process.env };
  const BASE = {
    JWT_SECRET: 'x'.repeat(40),
    CORS_ORIGINS: 'https://app.example.com',
    EMAIL_PROVIDER: 'none',
  };
  const load = (env) => {
    process.env = { ...BASE, ...env };
    return new ConfigManager().load();
  };
  afterEach(() => { process.env = { ...saved }; });

  it('refuses it in production on a real database', () => {
    expect(() => load({ NODE_ENV: 'production', MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/BRMC_dev?retryWrites=true' }))
      .toThrow(/EMAIL_PROVIDER=none is only allowed on a throw-away database .*"BRMC_dev"/);
  });

  it('refuses it in production when the URI names no database', () => {
    expect(() => load({ NODE_ENV: 'production', MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/?retryWrites=true' }))
      .toThrow(/\(none in MONGODB_URI\)/);
  });

  it('allows it in production on a throw-away _e2e database', () => {
    expect(load({ NODE_ENV: 'production', MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/BRMC_dev_e2e?retryWrites=true' }).email.provider)
      .toBe('none');
  });

  it('allows it outside production (local development, tests)', () => {
    expect(load({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://localhost:27017/mallakhamb' }).email.provider).toBe('none');
  });
});

describe('ConfigManager.databaseName', () => {
  it.each([
    ['mongodb+srv://u:p@cluster0.example.net/BRMC_dev?retryWrites=true&w=majority', 'BRMC_dev'],
    ['mongodb://u:p%2Fq@h1:27017,h2:27017/BRMC_dev_e2e?replicaSet=rs0', 'BRMC_dev_e2e'],
    ['mongodb://localhost:27017/mallakhamb', 'mallakhamb'],
    ['mongodb+srv://u:p@cluster0.example.net/', ''],
    ['mongodb+srv://u:p@cluster0.example.net', ''],
    ['', ''],
  ])('%s → "%s"', (uri, name) => {
    expect(ConfigManager.databaseName(uri)).toBe(name);
  });
});
