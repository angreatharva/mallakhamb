/**
 * Nodemailer Email Provider Adapter
 * 
 * Implements IEmailProvider using Nodemailer for SMTP email sending.
 * 
 * Requirements: 21.1, 21.2, 21.8
 */

const nodemailer = require('nodemailer');
const IEmailProvider = require('./email-provider.interface');

class NodemailerAdapter extends IEmailProvider {
  /**
   * Create a Nodemailer adapter
   * @param {Object} config - Nodemailer configuration
   * @param {string} config.host - SMTP host
   * @param {number} config.port - SMTP port
   * @param {boolean} config.secure - Use TLS
   * @param {string} config.user - SMTP username
   * @param {string} config.password - SMTP password
   * @param {Logger} logger - Logger instance
   */
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.transporter = null;
    this.initialize();
  }

  /**
   * Initialize Nodemailer transporter
   */
  initialize() {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password
        }
      });

      this.logger.info('Nodemailer adapter initialized', {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure
      });
    } catch (error) {
      this.logger.error('Nodemailer initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Send an email using Nodemailer
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result with messageId
   */
  async sendEmail(options) {
    try {
      const mailOptions = {
        from: options.from || this.config.user,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      };

      const result = await this.transporter.sendMail(mailOptions);

      this.logger.info('Email sent via Nodemailer', {
        to: options.to,
        subject: options.subject,
        messageId: result.messageId
      });

      return {
        success: true,
        messageId: result.messageId,
        provider: 'nodemailer'
      };
    } catch (error) {
      this.logger.error('Nodemailer send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify Nodemailer configuration
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async verifyConfiguration() {
    try {
      await this.transporter.verify();
      this.logger.info('Nodemailer configuration verified');
      return true;
    } catch (error) {
      this.logger.error('Nodemailer verification failed', { error: error.message });
      return false;
    }
  }
}

module.exports = NodemailerAdapter;
