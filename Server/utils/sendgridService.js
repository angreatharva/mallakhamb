let sgMail;
try {
  sgMail = require('@sendgrid/mail');
} catch (error) {
  console.log('📧 SendGrid package not installed, SendGrid service will be unavailable');
  sgMail = null;
}
require('dotenv').config();

/**
 * SendGrid Email Service
 * More reliable alternative for production hosting
 * 
 * Setup Instructions:
 * 1. Sign up for SendGrid (free tier: 100 emails/day)
 * 2. Create API key in SendGrid dashboard
 * 3. Add SENDGRID_API_KEY to environment variables
 * 4. Verify sender email in SendGrid dashboard
 */

// Initialize SendGrid only if package is available
if (sgMail && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('📧 SendGrid initialized successfully');
} else if (sgMail && !process.env.SENDGRID_API_KEY) {
  console.log('📧 SendGrid package available but API key not configured');
} else {
  console.log('📧 SendGrid package not available');
}

/**
 * Send email using SendGrid
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML content of the email
 * @returns {Promise<boolean>} - Returns true if email sent successfully
 */
async function sendEmailWithSendGrid(to, subject, html) {
  console.log('📧 SendGrid: Starting email send process...');
  
  try {
    // Check if SendGrid package is available
    if (!sgMail) {
      console.error('❌ SendGrid: Package not installed. Run: npm install @sendgrid/mail');
      return false;
    }

    console.log('📧 SendGrid: To:', to);
    console.log('📧 SendGrid: Subject:', subject);
    
    // Check if SendGrid is configured
    if (!process.env.SENDGRID_API_KEY) {
      console.error('❌ SendGrid: SENDGRID_API_KEY not configured');
      return false;
    }

    if (!process.env.EMAIL_USER) {
      console.error('❌ SendGrid: EMAIL_USER (sender email) not configured');
      return false;
    }

    // Validate input parameters
    if (!to || !subject || !html) {
      console.error('❌ SendGrid: Missing required parameters');
      return false;
    }

    const msg = {
      to: to,
      from: {
        email: process.env.EMAIL_USER,
        name: 'Mallakhamb Competition'
      },
      subject: subject,
      html: html,
      text: html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    console.log('📧 SendGrid: Sending email...');
    
    const response = await sgMail.send(msg);
    
    console.log('✅ SendGrid: Email sent successfully!');
    console.log('📧 SendGrid: Status Code:', response[0].statusCode);
    
    return true;

  } catch (error) {
    console.error('❌ SendGrid: Email send failed:', error.message);
    
    if (error.response) {
      console.error('📧 SendGrid: Error details:', {
        statusCode: error.response.statusCode,
        body: error.response.body
      });
    }
    
    return false;
  }
}

module.exports = {
  sendEmailWithSendGrid
};