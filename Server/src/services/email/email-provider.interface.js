/**
 * Email Provider Interface
 * 
 * Abstract interface for email providers.
 * Implementations must provide sendEmail method.
 * 
 * Requirements: 21.1, 21.2, 21.8
 */

class IEmailProvider {
  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content
   * @param {string} options.html - HTML content
   * @param {string} options.from - Sender email address (optional)
   * @returns {Promise<Object>} Send result with messageId
   * @throws {Error} If email sending fails
   */
  async sendEmail(options) {
    throw new Error('sendEmail method must be implemented by provider');
  }

  /**
   * Verify provider configuration
   * @returns {Promise<boolean>} True if configuration is valid
   */
  async verifyConfiguration() {
    throw new Error('verifyConfiguration method must be implemented by provider');
  }
}

module.exports = IEmailProvider;
