/**
 * Gmail API Email Provider Adapter
 *
 * Implements IEmailProvider by sending through the Gmail REST API over HTTPS
 * (port 443) instead of SMTP.
 *
 * Why this exists: Render's free web services block outbound traffic to the
 * SMTP ports 25, 465 and 587, so the Nodemailer adapter cannot reach
 * smtp.gmail.com from there — every OTP email timed out. The Gmail API sends
 * from the same Gmail account over ordinary HTTPS, which no host blocks.
 *
 * Auth is OAuth2 with a long-lived refresh token minted once by
 * `npm run gmail:token` (scripts/gmail-oauth-token.js). The adapter trades it
 * for a short-lived access token and caches that until shortly before expiry.
 * The only scope needed is `gmail.send`.
 */

const MailComposer = require('nodemailer/lib/mail-composer');
const IEmailProvider = require('./email-provider.interface');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Renew the access token this long before Google says it expires, so a token
// never runs out between the check and the request that uses it.
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;

class GmailApiAdapter extends IEmailProvider {
  /**
   * @param {Object} config
   * @param {string} config.clientId - OAuth client ID (Desktop app type)
   * @param {string} config.clientSecret - OAuth client secret
   * @param {string} config.refreshToken - Refresh token with the gmail.send scope
   * @param {string} config.user - The Gmail address the token belongs to (the sender)
   * @param {number} [config.timeoutMs] - Per-request timeout
   * @param {Logger} logger
   * @param {Function} [fetchImpl] - Injected for tests; defaults to global fetch
   */
  constructor(config, logger, fetchImpl = globalThis.fetch) {
    super();
    this.config = config;
    this.logger = logger;
    this.fetch = fetchImpl;
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.initialize();
  }

  initialize() {
    const missing = ['clientId', 'clientSecret', 'refreshToken', 'user']
      .filter((key) => !this.config[key]);
    if (missing.length > 0) {
      const error = new Error(`Gmail API adapter is missing configuration: ${missing.join(', ')}`);
      this.logger.error('Gmail API initialization failed', { error: error.message });
      throw error;
    }
    this.logger.info('Gmail API adapter initialized', { user: this.config.user });
  }

  /**
   * Exchange the refresh token for an access token, reusing a cached one
   * while it is still comfortably valid.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
      return this.accessToken;
    }

    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      // invalid_grant means the refresh token was revoked, or expired because
      // the OAuth app was left in "Testing" (7-day tokens). Say so — the raw
      // error alone doesn't tell an operator what to do.
      const hint = body.error === 'invalid_grant'
        ? ' (refresh token revoked or expired — run `npm run gmail:token` again and update GMAIL_REFRESH_TOKEN)'
        : '';
      throw new Error(`Gmail token refresh failed: ${body.error || response.status}${hint}`);
    }

    this.accessToken = body.access_token;
    this.accessTokenExpiresAt = Date.now() + (Number(body.expires_in) || 3600) * 1000;
    return this.accessToken;
  }

  /**
   * Build the RFC 822 message and base64url-encode it, as the API expects.
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async buildRawMessage(options) {
    const mail = new MailComposer({
      from: options.from || this.config.user,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    const message = await mail.compile().build();
    return message.toString('base64url');
  }

  /**
   * Send an email through the Gmail API
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result with messageId
   */
  async sendEmail(options) {
    try {
      const [accessToken, raw] = await Promise.all([
        this.getAccessToken(),
        this.buildRawMessage(options),
      ]);

      const response = await this.fetch(SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        // A 401 means the cached access token went bad early; drop it so the
        // retry in EmailService fetches a fresh one.
        if (response.status === 401) {
          this.accessToken = null;
        }
        throw new Error(`Gmail API send failed: ${response.status} ${body.error?.message || ''}`.trim());
      }

      this.logger.info('Email sent via Gmail API', {
        to: options.to,
        subject: options.subject,
        messageId: body.id,
      });

      return {
        success: true,
        messageId: body.id,
        provider: 'gmail-api',
      };
    } catch (error) {
      this.logger.error('Gmail API send failed', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify the credentials by refreshing an access token. That proves the
   * client, secret and refresh token are valid and that Google is reachable;
   * with only the gmail.send scope there is no read endpoint to probe further.
   * @returns {Promise<boolean>}
   */
  async verifyConfiguration() {
    try {
      this.accessToken = null;
      await this.getAccessToken();
      this.logger.info('Gmail API configuration verified');
      return true;
    } catch (error) {
      this.logger.error('Gmail API verification failed', { error: error.message });
      return false;
    }
  }
}

module.exports = GmailApiAdapter;
