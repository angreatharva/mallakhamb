const { sendEmail: sendWithGmail } = require('./emailService');

// Load Resend service
let sendWithResend;
try {
  const resendService = require('./resendService');
  sendWithResend = resendService.sendEmailWithResend;
  console.log('📧 Unified: Resend service loaded successfully');
} catch (error) {
  console.log('📧 Unified: Resend service not available:', error.message);
  sendWithResend = null;
}

/**
 * Unified Email Service
 * Tries multiple email providers in order of preference
 * 1. Resend (modern, excellent deliverability)
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
  const errors = [];
  
  // Try Resend first (modern, excellent deliverability)
  if (sendWithResend && process.env.RESEND_API_KEY) {
    console.log('📧 Unified: Trying Resend...');
    try {
      const result = await sendWithResend(to, subject, html);
      if (result) {
        console.log('✅ Unified: Email sent successfully via Resend');
        return true;
      }
      errors.push('Resend: Failed to send');
    } catch (error) {
      console.error('❌ Unified: Resend failed:', error.message);
      errors.push(`Resend: ${error.message}`);
    }
  } else if (!sendWithResend) {
    console.log('📧 Unified: Resend service not loaded, skipping...');
  } else {
    console.log('📧 Unified: Resend not configured (missing RESEND_API_KEY), skipping...');
  }

  // Fallback to Gmail SMTP
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log('📧 Unified: Trying Gmail SMTP...');
    try {
      const result = await sendWithGmail(to, subject, html);
      if (result) {
        console.log('✅ Unified: Email sent successfully via Gmail SMTP');
        return true;
      }
      errors.push('Gmail SMTP: Failed to send');
    } catch (error) {
      console.error('❌ Unified: Gmail SMTP failed:', error.message);
      errors.push(`Gmail SMTP: ${error.message}`);
    }
  } else {
    console.log('📧 Unified: Gmail SMTP not configured (missing EMAIL_USER or EMAIL_PASS), skipping...');
  }

  console.error('❌ Unified: All email providers failed');
  console.error('📧 Unified: Errors:', errors);
  return false;
}

module.exports = {
  sendEmail
};