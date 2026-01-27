const { sendEmail: sendWithGmail } = require('./emailService');

// Try to load SendGrid service, but don't fail if not available
let sendWithSendGrid;
try {
  const sendgridService = require('./sendgridService');
  sendWithSendGrid = sendgridService.sendEmailWithSendGrid;
  console.log('📧 Unified: SendGrid service loaded successfully');
} catch (error) {
  console.log('📧 Unified: SendGrid service not available:', error.message);
  sendWithSendGrid = null;
}

/**
 * Unified Email Service
 * Tries multiple email providers in order of preference
 * 1. SendGrid (most reliable for production)
 * 2. Gmail SMTP (fallback)
 */

/**
 * Send email using the best available service
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML content of the email
 * @returns {Promise<boolean>} - Returns true if email sent successfully
 */
async function sendEmail(to, subject, html) {
  console.log('📧 Unified: Starting email send with multiple providers...');
  
  // Try SendGrid first (more reliable for production)
  if (sendWithSendGrid && process.env.SENDGRID_API_KEY) {
    console.log('📧 Unified: Trying SendGrid...');
    try {
      const result = await sendWithSendGrid(to, subject, html);
      if (result) {
        console.log('✅ Unified: Email sent successfully via SendGrid');
        return true;
      }
    } catch (error) {
      console.error('❌ Unified: SendGrid failed:', error.message);
    }
  } else if (!sendWithSendGrid) {
    console.log('📧 Unified: SendGrid service not available, skipping...');
  } else {
    console.log('📧 Unified: SendGrid not configured (missing API key), skipping...');
  }

  // Fallback to Gmail SMTP
  console.log('📧 Unified: Trying Gmail SMTP...');
  try {
    const result = await sendWithGmail(to, subject, html);
    if (result) {
      console.log('✅ Unified: Email sent successfully via Gmail SMTP');
      return true;
    }
  } catch (error) {
    console.error('❌ Unified: Gmail SMTP failed:', error.message);
  }

  console.error('❌ Unified: All email providers failed');
  return false;
}

module.exports = {
  sendEmail
};