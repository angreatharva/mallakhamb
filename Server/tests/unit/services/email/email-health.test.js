/**
 * The email health check used to say "healthy" whenever a provider was
 * configured. On Render free the SMTP port is blocked, so every OTP email
 * failed while /api/health stayed green. These pin the real check.
 */
const EmailService = require('../../../../src/services/email/email.service');
const HealthMonitor = require('../../../../src/infrastructure/health-monitor');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function serviceWith(verify) {
  const config = {
    get: (key) => ({
      'email.provider': 'nodemailer',
      'email.nodemailer': { host: 'smtp.example.com', port: 587, secure: false, user: 'u', password: 'p' },
    }[key]),
  };
  const service = new EmailService(config, logger);
  service.provider = { verifyConfiguration: jest.fn(verify) };
  return service;
}

describe('EmailService.checkHealth', () => {
  it('asks the provider to really connect', async () => {
    const service = serviceWith(async () => false);
    await expect(service.checkHealth()).resolves.toMatchObject({ healthy: false, provider: 'nodemailer' });
    expect(service.provider.verifyConfiguration).toHaveBeenCalledTimes(1);
  });

  it('caches the answer so monitoring polls do not dial out every time', async () => {
    const service = serviceWith(async () => true);
    await service.checkHealth();
    await service.checkHealth();
    expect(service.provider.verifyConfiguration).toHaveBeenCalledTimes(1);

    service.healthCache.at -= service.healthCacheMs + 1;
    await service.checkHealth();
    expect(service.provider.verifyConfiguration).toHaveBeenCalledTimes(2);
  });
});

describe('HealthMonitor email check', () => {
  it('reports an unreachable provider as degraded — never unhealthy, never a 503', async () => {
    const monitor = new HealthMonitor({ get: () => 'nodemailer' }, logger, {
      checkHealth: async () => ({ healthy: false, provider: 'nodemailer' }),
    });
    await expect(monitor.checkEmailService()).resolves.toMatchObject({ status: 'degraded', healthy: false });
  });

  it('reports a reachable provider as healthy', async () => {
    const monitor = new HealthMonitor({ get: () => 'gmail-api' }, logger, {
      checkHealth: async () => ({ healthy: true, provider: 'gmail-api' }),
    });
    await expect(monitor.checkEmailService()).resolves.toMatchObject({ status: 'healthy', provider: 'gmail-api' });
  });
});
