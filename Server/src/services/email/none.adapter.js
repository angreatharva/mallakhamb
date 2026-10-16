/**
 * "none" Email Provider Adapter
 *
 * Sends nothing. Used by the nightly lifecycle check (deploy/oci/PLAN.md O14),
 * which registers 110 athletes, 16 judges and 12 coaches on a throw-away
 * database: no message may leave the server. Each suppressed message is logged
 * (recipient and subject only, never the body — it can hold an OTP) and
 * counted, so a run can still show what would have been sent.
 *
 * ConfigManager refuses this provider in production unless the database is a
 * throw-away one (name ending in "_e2e"), so it cannot silence real email.
 */

const IEmailProvider = require('./email-provider.interface');

class NoneAdapter extends IEmailProvider {
  /**
   * @param {Object} _config - unused; kept for the same shape as the other adapters
   * @param {Logger} logger - Logger instance
   */
  constructor(_config, logger) {
    super();
    this.logger = logger;
    this.suppressed = 0;
    this.logger.warn('Email provider is "none": no email will be sent');
  }

  /**
   * Log and drop the message.
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result, as if delivered
   */
  async sendEmail(options) {
    this.suppressed += 1;
    this.logger.info('Email suppressed (EMAIL_PROVIDER=none)', {
      to: options.to,
      subject: options.subject,
    });
    return {
      success: true,
      messageId: `none-${this.suppressed}`,
      provider: 'none',
    };
  }

  /**
   * Nothing to connect to, so always healthy.
   * @returns {Promise<boolean>}
   */
  async verifyConfiguration() {
    return true;
  }
}

module.exports = NoneAdapter;
