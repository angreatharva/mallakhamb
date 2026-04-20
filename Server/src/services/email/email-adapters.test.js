/**
 * Email Provider Adapters Unit Tests
 *
 * Tests NodemailerAdapter, ResendAdapter, and IEmailProvider interface.
 * Requirements: 15.1, 15.6
 */

const IEmailProvider = require('./email-provider.interface');

// ─── IEmailProvider interface ────────────────────────────────────────────────

describe('IEmailProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new IEmailProvider();
  });

  it('should throw when sendEmail is called directly', async () => {
    await expect(provider.sendEmail({})).rejects.toThrow(
      'sendEmail method must be implemented by provider'
    );
  });

  it('should throw when verifyConfiguration is called directly', async () => {
    await expect(provider.verifyConfiguration()).rejects.toThrow(
      'verifyConfiguration method must be implemented by provider'
    );
  });
});

// ─── NodemailerAdapter ───────────────────────────────────────────────────────

describe('NodemailerAdapter', () => {
  let NodemailerAdapter;
  let mockTransporter;
  let mockLogger;
  let mockNodemailer;

  beforeEach(() => {
    // Reset module registry so we can inject mock
    jest.resetModules();

    mockTransporter = {
      sendMail: jest.fn(),
      verify: jest.fn()
    };

    mockNodemailer = {
      createTransport: jest.fn().mockReturnValue(mockTransporter)
    };

    jest.mock('nodemailer', () => mockNodemailer);

    NodemailerAdapter = require('./nodemailer.adapter');

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  });

  afterEach(() => {
    jest.resetModules();
  });

  const makeAdapter = (configOverrides = {}) => {
    const config = {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user@example.com',
      password: 'secret',
      ...configOverrides
    };
    return new NodemailerAdapter(config, mockLogger);
  };

  describe('constructor / initialize', () => {
    it('should create transporter with correct config', () => {
      makeAdapter();

      expect(mockNodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' }
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Nodemailer adapter initialized',
        expect.objectContaining({ host: 'smtp.example.com' })
      );
    });

    it('should throw and log error when createTransport throws', () => {
      mockNodemailer.createTransport.mockImplementation(() => {
        throw new Error('SMTP error');
      });

      expect(() => makeAdapter()).toThrow('SMTP error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Nodemailer initialization failed',
        expect.objectContaining({ error: 'SMTP error' })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send email and return success result', async () => {
      const adapter = makeAdapter();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'msg-001' });

      const result = await adapter.sendEmail({
        to: 'recipient@example.com',
        subject: 'Hello',
        text: 'World',
        html: '<p>World</p>'
      });

      expect(result).toEqual({
        success: true,
        messageId: 'msg-001',
        provider: 'nodemailer'
      });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'user@example.com',
          to: 'recipient@example.com',
          subject: 'Hello'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Email sent via Nodemailer',
        expect.objectContaining({ to: 'recipient@example.com', messageId: 'msg-001' })
      );
    });

    it('should use options.from when provided', async () => {
      const adapter = makeAdapter();
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'msg-002' });

      await adapter.sendEmail({
        from: 'custom@example.com',
        to: 'recipient@example.com',
        subject: 'Test'
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@example.com' })
      );
    });

    it('should throw and log error when sendMail fails', async () => {
      const adapter = makeAdapter();
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP send failed'));

      await expect(
        adapter.sendEmail({ to: 'r@example.com', subject: 'Test' })
      ).rejects.toThrow('SMTP send failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Nodemailer send failed',
        expect.objectContaining({ error: 'SMTP send failed' })
      );
    });
  });

  describe('verifyConfiguration', () => {
    it('should return true when verify succeeds', async () => {
      const adapter = makeAdapter();
      mockTransporter.verify.mockResolvedValue(true);

      const result = await adapter.verifyConfiguration();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Nodemailer configuration verified');
    });

    it('should return false and log error when verify fails', async () => {
      const adapter = makeAdapter();
      mockTransporter.verify.mockRejectedValue(new Error('Auth failed'));

      const result = await adapter.verifyConfiguration();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Nodemailer verification failed',
        expect.objectContaining({ error: 'Auth failed' })
      );
    });
  });
});

// ─── ResendAdapter ───────────────────────────────────────────────────────────

describe('ResendAdapter', () => {
  let ResendAdapter;
  let mockResendClient;
  let mockResendConstructor;
  let mockLogger;

  beforeEach(() => {
    jest.resetModules();

    mockResendClient = {
      emails: {
        send: jest.fn()
      }
    };

    mockResendConstructor = jest.fn().mockReturnValue(mockResendClient);

    jest.mock('resend', () => ({ Resend: mockResendConstructor }));

    ResendAdapter = require('./resend.adapter');

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  });

  afterEach(() => {
    jest.resetModules();
  });

  const makeAdapter = (configOverrides = {}) => {
    const config = {
      apiKey: 're_test_key',
      fromEmail: 'noreply@example.com',
      ...configOverrides
    };
    return new ResendAdapter(config, mockLogger);
  };

  describe('constructor / initialize', () => {
    it('should create Resend client with API key', () => {
      makeAdapter();

      expect(mockResendConstructor).toHaveBeenCalledWith('re_test_key');
      expect(mockLogger.info).toHaveBeenCalledWith('Resend adapter initialized');
    });

    it('should throw when API key is missing', () => {
      expect(() => makeAdapter({ apiKey: '' })).toThrow('Resend API key is required');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resend initialization failed',
        expect.objectContaining({ error: 'Resend API key is required' })
      );
    });

    it('should throw and log when Resend constructor throws', () => {
      mockResendConstructor.mockImplementation(() => {
        throw new Error('Invalid key');
      });

      expect(() => makeAdapter()).toThrow('Invalid key');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resend initialization failed',
        expect.objectContaining({ error: 'Invalid key' })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send email and return success result', async () => {
      const adapter = makeAdapter();
      mockResendClient.emails.send.mockResolvedValue({ id: 'resend-msg-001' });

      const result = await adapter.sendEmail({
        to: 'recipient@example.com',
        subject: 'Hello',
        text: 'World',
        html: '<p>World</p>'
      });

      expect(result).toEqual({
        success: true,
        messageId: 'resend-msg-001',
        provider: 'resend'
      });
      expect(mockResendClient.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'recipient@example.com',
          subject: 'Hello'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Email sent via Resend',
        expect.objectContaining({ to: 'recipient@example.com', messageId: 'resend-msg-001' })
      );
    });

    it('should use options.from when provided', async () => {
      const adapter = makeAdapter();
      mockResendClient.emails.send.mockResolvedValue({ id: 'resend-msg-002' });

      await adapter.sendEmail({
        from: 'custom@example.com',
        to: 'recipient@example.com',
        subject: 'Test'
      });

      expect(mockResendClient.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@example.com' })
      );
    });

    it('should throw and log error when send fails', async () => {
      const adapter = makeAdapter();
      mockResendClient.emails.send.mockRejectedValue(new Error('API error'));

      await expect(
        adapter.sendEmail({ to: 'r@example.com', subject: 'Test' })
      ).rejects.toThrow('API error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resend send failed',
        expect.objectContaining({ error: 'API error' })
      );
    });
  });

  describe('verifyConfiguration', () => {
    it('should return true when API key is set', async () => {
      const adapter = makeAdapter();

      const result = await adapter.verifyConfiguration();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Resend configuration verified');
    });

    it('should return false when API key is not set after construction', async () => {
      const adapter = makeAdapter();
      // Simulate key being cleared after construction
      adapter.config.apiKey = '';

      const result = await adapter.verifyConfiguration();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Resend API key not configured');
    });
  });
});
