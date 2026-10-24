/**
 * "none" Email Provider Adapter
 *
 * Sends nothing. Used by the lifecycle check (deploy/oci/PLAN.md O14), which
 * registers a whole season of coaches, athletes and judges on a throw-away
 * database: no message may leave the server. Each suppressed message is logged
 * (recipient and subject only, never the body — it can hold an OTP) and
 * counted, so a run can still show what would have been sent.
 *
 * With EMAIL_CAPTURE=true it also keeps each message — recipient, subject and
 * text — in the `e2e_outbox` collection of the database the API is connected
 * to, so the run can assert what was sent (the OTP that resets a password, the
 * Player ID a coach is told) without any of it being delivered. That database
 * is the throw-away one and is emptied after the run.
 *
 * ConfigManager refuses this provider in production unless the database is a
 * throw-away one (name ending in "_e2e"), so it cannot silence real email; and
 * it refuses EMAIL_CAPTURE with any other provider.
 */

const IEmailProvider = require('./email-provider.interface');

/** Where captured messages go. Read by Server/scripts/seedMail.js. */
const OUTBOX = 'e2e_outbox';

class NoneAdapter extends IEmailProvider {
  /**
   * @param {{capture?: boolean}|null} config - `capture` keeps messages in e2e_outbox
   * @param {Logger} logger - Logger instance
   * @param {{db?: () => (Object|null)}} [deps] - the database handle, injectable for tests
   */
  constructor(config, logger, deps = {}) {
    super();
    this.logger = logger;
    this.suppressed = 0;
    this.capture = Boolean(config?.capture);
    this.db = deps.db || (() => {
      const { connection } = require('mongoose');
      return connection.readyState === 1 ? connection.db : null;
    });
    this.logger.warn(`Email provider is "none": no email will be sent${this.capture ? ` (kept in ${OUTBOX})` : ''}`);
  }

  /**
   * Log and drop the message — and keep it, when capturing.
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result, as if delivered
   */
  async sendEmail(options) {
    this.suppressed += 1;
    this.logger.info('Email suppressed (EMAIL_PROVIDER=none)', {
      to: options.to,
      subject: options.subject,
    });
    if (this.capture) {
      try {
        await this.db()?.collection(OUTBOX).insertOne({
          to: String(options.to || '').toLowerCase(),
          subject: options.subject || '',
          text: options.text || '',
          at: new Date(),
        });
      } catch (error) {
        // A capture that fails must not fail the request that sent the mail.
        this.logger.warn('Could not keep a suppressed email', { error: error.message });
      }
    }
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
module.exports.OUTBOX = OUTBOX;
