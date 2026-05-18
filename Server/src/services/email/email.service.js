/**
 * Email Service
 * 
 * Unified email service with multiple provider support, template rendering,
 * retry logic, queueing, and delivery tracking.
 * 
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */

const NodemailerAdapter = require('./nodemailer.adapter');
const ResendAdapter = require('./resend.adapter');
const { generateOTPEmail } = require('./templates/otp.template');
const { generatePasswordResetEmail } = require('./templates/password-reset.template');
const { generateNotificationEmail } = require('./templates/notification.template');

class EmailService {
  /**
   * Create an email service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   */
  constructor(configManager, logger) {
    this.config = configManager;
    this.logger = logger;
    this.provider = null;
    this.queue = [];
    this.deliveryLog = new Map();
    this.isProcessingQueue = false;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second initial delay
    this.initialize();
  }

  /**
   * Initialize email provider based on configuration
   */
  initialize() {
    try {
      const providerType = this.config.get('email.provider');

      if (providerType === 'resend') {
        this.provider = new ResendAdapter(
          this.config.get('email.resend'),
          this.logger
        );
      } else {
        // Default to nodemailer
        this.provider = new NodemailerAdapter(
          this.config.get('email.nodemailer'),
          this.logger
        );
      }

      this.logger.info('Email service initialized', { provider: providerType });
    } catch (error) {
      this.logger.error('Email service initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if email is valid
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Send email with retry logic
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content
   * @param {string} options.html - HTML content
   * @param {string} options.from - Sender email address (optional)
   * @param {boolean} options.queue - Queue email for async sending (default: false)
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    try {
      // Validate email address
      if (!this.validateEmail(options.to)) {
        throw new Error(`Invalid email address: ${options.to}`);
      }

      // If queueing is enabled, add to queue
      if (options.queue) {
        return this.queueEmail(options);
      }

      // Send immediately with retry logic
      return await this.sendWithRetry(options);
    } catch (error) {
      this.logger.error('Email send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send email with exponential backoff retry
   * @param {Object} options - Email options
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} Send result
   */
  async sendWithRetry(options, attempt = 1) {
    try {
      const result = await this.provider.sendEmail(options);

      // Track delivery
      this.trackDelivery(options.to, result);

      return result;
    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        
        this.logger.warn('Email send failed, retrying', {
          to: options.to,
          attempt,
          nextRetryIn: delay,
          error: error.message
        });

        await this.sleep(delay);
        return this.sendWithRetry(options, attempt + 1);
      }

      // Max retries reached
      this.logger.error('Email send failed after max retries', {
        to: options.to,
        attempts: attempt,
        error: error.message
      });

      // Track failed delivery
      this.trackDelivery(options.to, {
        success: false,
        error: error.message,
        attempts: attempt
      });

      throw error;
    }
  }

  /**
   * Queue email for asynchronous sending
   * @param {Object} options - Email options
   * @returns {Object} Queue result
   */
  queueEmail(options) {
    const queueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.queue.push({
      id: queueId,
      options,
      addedAt: new Date()
    });

    this.logger.info('Email queued', {
      queueId,
      to: options.to,
      queueSize: this.queue.length
    });

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }

    return {
      success: true,
      queued: true,
      queueId,
      queueSize: this.queue.length
    };
  }

  /**
   * Process email queue
   */
  async processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.logger.info('Processing email queue', { queueSize: this.queue.length });

    while (this.queue.length > 0) {
      const item = this.queue.shift();

      try {
        await this.sendWithRetry(item.options);
        this.logger.info('Queued email sent', { queueId: item.id, to: item.options.to });
      } catch (error) {
        this.logger.error('Queued email failed', {
          queueId: item.id,
          to: item.options.to,
          error: error.message
        });
      }

      // Small delay between emails to avoid rate limiting
      await this.sleep(100);
    }

    this.isProcessingQueue = false;
    this.logger.info('Email queue processing completed');
  }

  /**
   * Track email delivery
   * @param {string} to - Recipient email
   * @param {Object} result - Send result
   */
  trackDelivery(to, result) {
    const deliveryRecord = {
      to,
      timestamp: new Date(),
      success: result.success,
      messageId: result.messageId,
      provider: result.provider,
      error: result.error,
      attempts: result.attempts
    };

    this.deliveryLog.set(result.messageId || `failed-${Date.now()}`, deliveryRecord);

    // Limit delivery log size (keep last 1000 records)
    if (this.deliveryLog.size > 1000) {
      const firstKey = this.deliveryLog.keys().next().value;
      this.deliveryLog.delete(firstKey);
    }

    this.logger.debug('Email delivery tracked', deliveryRecord);
  }

  /**
   * Get delivery status for a message
   * @param {string} messageId - Message ID
   * @returns {Object|null} Delivery record or null
   */
  getDeliveryStatus(messageId) {
    return this.deliveryLog.get(messageId) || null;
  }

  /**
   * Get delivery statistics
   * @returns {Object} Delivery statistics
   */
  getDeliveryStats() {
    const records = Array.from(this.deliveryLog.values());
    const total = records.length;
    const successful = records.filter(r => r.success).length;
    const failed = total - successful;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0,
      queueSize: this.queue.length
    };
  }

  /**
   * Send OTP email
   * @param {string} to - Recipient email
   * @param {Object} data - OTP data
   * @param {string} data.otp - OTP code
   * @param {string} data.userName - User name
   * @param {number} data.expiryMinutes - OTP expiry time
   * @returns {Promise<Object>} Send result
   */
  async sendOTP(to, data) {
    const { subject, text, html } = generateOTPEmail(data);

    return this.sendEmail({
      to,
      subject,
      text,
      html
    });
  }

  /**
   * Send password reset confirmation email
   * @param {string} to - Recipient email
   * @param {Object} data - Password reset data
   * @param {string} data.userName - User name
   * @param {string} data.resetLink - Reset link (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordReset(to, data) {
    const { subject, text, html } = generatePasswordResetEmail(data);

    return this.sendEmail({
      to,
      subject,
      text,
      html
    });
  }

  /**
   * Send notification email
   * @param {string} to - Recipient email
   * @param {Object} data - Notification data
   * @param {string} data.userName - User name
   * @param {string} data.title - Notification title
   * @param {string} data.message - Notification message
   * @param {string} data.actionUrl - Action URL (optional)
   * @param {string} data.actionText - Action button text (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendNotification(to, data) {
    const { subject, text, html } = generateNotificationEmail(data);

    return this.sendEmail({
      to,
      subject,
      text,
      html
    });
  }

  /**
   * Preview email (for development)
   * @param {string} template - Template name (otp, password-reset, notification)
   * @param {Object} data - Template data
   * @returns {Object} Email content
   */
  previewEmail(template, data) {
    switch (template) {
      case 'otp':
        return generateOTPEmail(data);
      case 'password-reset':
        return generatePasswordResetEmail(data);
      case 'notification':
        return generateNotificationEmail(data);
      default:
        throw new Error(`Unknown template: ${template}`);
    }
  }

  /**
   * Verify provider configuration
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async verifyConfiguration() {
    try {
      return await this.provider.verifyConfiguration();
    } catch (error) {
      this.logger.error('Email configuration verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Sleep utility for delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EmailService;
