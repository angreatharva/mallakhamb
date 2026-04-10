/**
 * Email Service Unit Tests
 * 
 * Tests email sending with different providers, template rendering, and retry logic.
 * 
 * Requirements: 15.1, 15.6
 */

const EmailService = require('./email.service');
const NodemailerAdapter = require('./nodemailer.adapter');
const ResendAdapter = require('./resend.adapter');

// Mock the adapters
jest.mock('./nodemailer.adapter');
jest.mock('./resend.adapter');

describe('EmailService', () => {
  let emailService;
  let mockConfig;
  let mockLogger;
  let mockProvider;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock provider
    mockProvider = {
      sendEmail: jest.fn(),
      verifyConfiguration: jest.fn()
    };

    // Mock config
    mockConfig = {
      get: jest.fn((key) => {
        const config = {
          'email.provider': 'nodemailer',
          'email.nodemailer': {
            host: 'smtp.test.com',
            port: 587,
            secure: false,
            user: 'test@test.com',
            password: 'password'
          },
          'email.resend': {
            apiKey: 'test-api-key',
            fromEmail: 'test@test.com'
          }
        };
        return config[key];
      })
    };

    // Mock NodemailerAdapter constructor
    NodemailerAdapter.mockImplementation(() => mockProvider);
    ResendAdapter.mockImplementation(() => mockProvider);

    emailService = new EmailService(mockConfig, mockLogger);
  });

  describe('initialization', () => {
    it('should initialize with nodemailer provider by default', () => {
      expect(NodemailerAdapter).toHaveBeenCalledWith(
        mockConfig.get('email.nodemailer'),
        mockLogger
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Email service initialized',
        { provider: 'nodemailer' }
      );
    });

    it('should initialize with resend provider when configured', () => {
      mockConfig.get = jest.fn((key) => {
        if (key === 'email.provider') return 'resend';
        if (key === 'email.resend') return {
          apiKey: 'test-api-key',
          fromEmail: 'test@test.com'
        };
      });

      const service = new EmailService(mockConfig, mockLogger);

      expect(ResendAdapter).toHaveBeenCalledWith(
        mockConfig.get('email.resend'),
        mockLogger
      );
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(emailService.validateEmail('test@example.com')).toBe(true);
      expect(emailService.validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(emailService.validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(emailService.validateEmail('invalid')).toBe(false);
      expect(emailService.validateEmail('invalid@')).toBe(false);
      expect(emailService.validateEmail('@example.com')).toBe(false);
      expect(emailService.validateEmail('test@')).toBe(false);
      expect(emailService.validateEmail('')).toBe(false);
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const mockResult = {
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      };

      mockProvider.sendEmail.mockResolvedValue(mockResult);

      const options = {
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'Test content',
        html: '<p>Test content</p>'
      };

      const result = await emailService.sendEmail(options);

      expect(result).toEqual(mockResult);
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(options);
      expect(emailService.deliveryLog.size).toBe(1);
    });

    it('should throw error for invalid email address', async () => {
      const options = {
        to: 'invalid-email',
        subject: 'Test',
        text: 'Test'
      };

      await expect(emailService.sendEmail(options)).rejects.toThrow('Invalid email address');
      expect(mockProvider.sendEmail).not.toHaveBeenCalled();
    });

    it('should queue email when queue option is true', async () => {
      // Prevent automatic queue processing
      emailService.isProcessingQueue = true;

      const options = {
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'Test content',
        queue: true
      };

      const result = await emailService.sendEmail(options);

      expect(result.queued).toBe(true);
      expect(result.queueId).toBeDefined();
      expect(emailService.queue.length).toBe(1);
      expect(mockProvider.sendEmail).not.toHaveBeenCalled();

      // Reset flag
      emailService.isProcessingQueue = false;
    });
  });

  describe('sendWithRetry', () => {
    it('should retry on failure with exponential backoff', async () => {
      mockProvider.sendEmail
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          messageId: 'msg-123',
          provider: 'nodemailer'
        });

      const options = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Test'
      };

      const result = await emailService.sendWithRetry(options);

      expect(result.success).toBe(true);
      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockProvider.sendEmail.mockRejectedValue(new Error('Network error'));

      const options = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Test'
      };

      await expect(emailService.sendWithRetry(options)).rejects.toThrow('Network error');
      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Email send failed after max retries',
        expect.any(Object)
      );
    });
  });

  describe('queueEmail', () => {
    it('should add email to queue', () => {
      // Prevent automatic queue processing
      emailService.isProcessingQueue = true;

      const options = {
        to: 'test@example.com',
        subject: 'Test',
        text: 'Test'
      };

      const result = emailService.queueEmail(options);

      expect(result.queued).toBe(true);
      expect(result.queueId).toBeDefined();
      expect(emailService.queue.length).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Email queued',
        expect.objectContaining({
          to: 'test@example.com',
          queueSize: 1
        })
      );

      // Reset flag
      emailService.isProcessingQueue = false;
    });
  });

  describe('processQueue', () => {
    it('should process queued emails', async () => {
      mockProvider.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      });

      // Add emails to queue
      emailService.queue.push({
        id: 'queue-1',
        options: { to: 'test1@example.com', subject: 'Test 1', text: 'Test 1' }
      });
      emailService.queue.push({
        id: 'queue-2',
        options: { to: 'test2@example.com', subject: 'Test 2', text: 'Test 2' }
      });

      await emailService.processQueue();

      expect(mockProvider.sendEmail).toHaveBeenCalledTimes(2);
      expect(emailService.queue.length).toBe(0);
      expect(emailService.isProcessingQueue).toBe(false);
    });

    it('should not process queue if already processing', async () => {
      emailService.isProcessingQueue = true;
      emailService.queue.push({
        id: 'queue-1',
        options: { to: 'test@example.com', subject: 'Test', text: 'Test' }
      });

      await emailService.processQueue();

      expect(mockProvider.sendEmail).not.toHaveBeenCalled();
      expect(emailService.queue.length).toBe(1);
    });
  });

  describe('trackDelivery', () => {
    it('should track successful delivery', () => {
      const result = {
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      };

      emailService.trackDelivery('test@example.com', result);

      const record = emailService.getDeliveryStatus('msg-123');
      expect(record).toBeDefined();
      expect(record.to).toBe('test@example.com');
      expect(record.success).toBe(true);
      expect(record.messageId).toBe('msg-123');
    });

    it('should track failed delivery', () => {
      const result = {
        success: false,
        error: 'Network error',
        attempts: 3
      };

      emailService.trackDelivery('test@example.com', result);

      expect(emailService.deliveryLog.size).toBe(1);
    });

    it('should limit delivery log size', () => {
      // Add 1001 records
      for (let i = 0; i < 1001; i++) {
        emailService.trackDelivery(`test${i}@example.com`, {
          success: true,
          messageId: `msg-${i}`,
          provider: 'nodemailer'
        });
      }

      expect(emailService.deliveryLog.size).toBe(1000);
    });
  });

  describe('getDeliveryStats', () => {
    it('should return delivery statistics', () => {
      emailService.trackDelivery('test1@example.com', {
        success: true,
        messageId: 'msg-1',
        provider: 'nodemailer'
      });
      emailService.trackDelivery('test2@example.com', {
        success: true,
        messageId: 'msg-2',
        provider: 'nodemailer'
      });
      emailService.trackDelivery('test3@example.com', {
        success: false,
        error: 'Failed'
      });

      const stats = emailService.getDeliveryStats();

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe('66.67');
    });
  });

  describe('sendOTP', () => {
    it('should send OTP email with template', async () => {
      mockProvider.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      });

      const result = await emailService.sendOTP('test@example.com', {
        otp: '123456',
        userName: 'Test User',
        expiryMinutes: 10
      });

      expect(result.success).toBe(true);
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('OTP'),
          text: expect.stringContaining('123456'),
          html: expect.stringContaining('123456')
        })
      );
    });
  });

  describe('sendPasswordReset', () => {
    it('should send password reset email with template', async () => {
      mockProvider.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      });

      const result = await emailService.sendPasswordReset('test@example.com', {
        userName: 'Test User',
        resetLink: 'https://example.com/reset'
      });

      expect(result.success).toBe(true);
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Password Reset'),
          text: expect.any(String),
          html: expect.any(String)
        })
      );
    });
  });

  describe('sendNotification', () => {
    it('should send notification email with template', async () => {
      mockProvider.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
        provider: 'nodemailer'
      });

      const result = await emailService.sendNotification('test@example.com', {
        userName: 'Test User',
        title: 'Test Notification',
        message: 'This is a test notification',
        actionUrl: 'https://example.com/action',
        actionText: 'View Details'
      });

      expect(result.success).toBe(true);
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Test Notification'),
          text: expect.stringContaining('This is a test notification'),
          html: expect.stringContaining('This is a test notification')
        })
      );
    });
  });

  describe('previewEmail', () => {
    it('should preview OTP email template', () => {
      const preview = emailService.previewEmail('otp', {
        otp: '123456',
        userName: 'Test User',
        expiryMinutes: 10
      });

      expect(preview.subject).toContain('OTP');
      expect(preview.text).toContain('123456');
      expect(preview.html).toContain('123456');
    });

    it('should preview password reset email template', () => {
      const preview = emailService.previewEmail('password-reset', {
        userName: 'Test User',
        resetLink: 'https://example.com/reset'
      });

      expect(preview.subject).toContain('Password Reset');
      expect(preview.text).toContain('Test User');
      expect(preview.html).toContain('Test User');
    });

    it('should preview notification email template', () => {
      const preview = emailService.previewEmail('notification', {
        userName: 'Test User',
        title: 'Test Notification',
        message: 'Test message'
      });

      expect(preview.subject).toContain('Test Notification');
      expect(preview.text).toContain('Test message');
      expect(preview.html).toContain('Test message');
    });

    it('should throw error for unknown template', () => {
      expect(() => {
        emailService.previewEmail('unknown', {});
      }).toThrow('Unknown template: unknown');
    });
  });

  describe('verifyConfiguration', () => {
    it('should verify provider configuration', async () => {
      mockProvider.verifyConfiguration.mockResolvedValue(true);

      const result = await emailService.verifyConfiguration();

      expect(result).toBe(true);
      expect(mockProvider.verifyConfiguration).toHaveBeenCalled();
    });

    it('should return false on verification failure', async () => {
      mockProvider.verifyConfiguration.mockRejectedValue(new Error('Verification failed'));

      const result = await emailService.verifyConfiguration();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Email configuration verification failed',
        expect.any(Object)
      );
    });
  });
});
