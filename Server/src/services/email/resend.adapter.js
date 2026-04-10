/**
 * Resend Email Provider Adapter
 * 
 * Implements IEmailProvider using Resend API for email sending.
 * 
 * Requirements: 21.1, 21.2, 21.8
 */

const { Resend } = require('resend');
const IEmailProvider = require('./email-provider.interface');

class ResendAdapter extends IEmailProvider {
  /**
   * Create a Resend adapter
   * @param {Object} config - Resend configuration
   * @param {string} config.apiKey - Resend API key
   * @param {string} config.fromEmail - Default from email address
   * @param {Logger} logger - Logger instance
   */
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.client = null;
    this.initialize();
  }

  /**
   * Initialize Resend client
   */
  initialize() {
    try {
      if (!this.config.apiKey) {
        throw new Error('Resend API key is required');
      }

      this.client = new Resend(this.config.apiKey);

      this.logger.info('Resend adapter initialized');
    } catch (error) {
      this.logger.error('Resend initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Send an email using Resend
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result with messageId
   */
  async sendEmail(options) {
    try {
      const emailData = {
        from: options.from || this.config.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      };

      const result = await this.client.emails.send(emailData);

      this.logger.info('Email sent via Resend', {
        to: options.to,
        subject: options.subject,
        messageId: result.id
      });

      return {
        success: true,
        messageId: result.id,
        provider: 'resend'
      };
    } catch (error) {
      this.logger.error('Resend send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify Resend configuration
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async verifyConfiguration() {
    try {
      // Resend doesn't have a verify endpoint, so we check if API key is set
      if (!this.config.apiKey) {
        this.logger.warn('Resend API key not configured');
        return false;
      }

      this.logger.info('Resend configuration verified');
      return true;
    } catch (error) {
      this.logger.error('Resend verification failed', { error: error.message });
      return false;
    }
  }
}

module.exports = ResendAdapter;
