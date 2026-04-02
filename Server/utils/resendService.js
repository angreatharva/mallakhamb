const { Resend } = require('resend');
require('dotenv').config();

/**
 * Resend Email Service
 * Modern, reliable email API with excellent deliverability
 * 
 * Setup Instructions:
 * 1. Sign up at https://resend.com (free tier: 100 emails/day, 3,000/month)
 * 2. Add and verify your domain (or use onboarding@resend.dev for testing)
 * 3. Create API key in Resend dashboard
 * 4. Add RESEND_API_KEY to environment variables
 * 5. Add RESEND_FROM_EMAIL (e.g., noreply@yourdomain.com or onboarding@resend.dev)
 */

let resend = null;

// Initialize Resend only if API key is available
if (process.env.RESEND_API_KEY) {
  try {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('📧 Resend initialized successfully');
  } catch (error) {
    console.error('❌ Resend initialization failed:', error.message);
  }
} else {
  console.log('📧 Resend API key not configured');
}

/**
 * Send email using Resend
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML content of the email
 * @returns {Promise<boolean>} - Returns true if email sent successfully
 */
async function sendEmailWithResend(to, subject, html) {
  console.log('📧 Resend: Starting email send process...');
  
  try {
    // Check if Resend is initialized
    if (!resend) {
      console.error('❌ Resend: Not initialized. Check RESEND_API_KEY environment variable');
      return false;
    }

    console.log('📧 Resend: To:', to);
    console.log('📧 Resend: Subject:', subject);
    
    // Check if sender email is configured
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_USER;
    if (!fromEmail) {
      console.error('❌ Resend: RESEND_FROM_EMAIL or EMAIL_USER not configured');
      console.error('💡 Set RESEND_FROM_EMAIL to your verified domain email (e.g., noreply@yourdomain.com)');
      console.error('💡 For testing, you can use: onboarding@resend.dev');
      return false;
    }

    // Validate input parameters
    if (!to || !subject || !html) {
      console.error('❌ Resend: Missing required parameters (to, subject, or html)');
      return false;
    }

    console.log('📧 Resend: Sending email...');
    console.log('📧 Resend: From:', fromEmail);
    
    const { data, error } = await resend.emails.send({
      from: `Mallakhamb Competition <${fromEmail}>`,
      to: [to],
      subject: subject,
      html: html,
      // Resend automatically generates text version from HTML
    });

    if (error) {
      console.error('❌ Resend: Email send failed:', error.message);
      console.error('📧 Resend: Error details:', error);
      return false;
    }
    
    console.log('✅ Resend: Email sent successfully!');
    console.log('📧 Resend: Email ID:', data.id);
    
    return true;

  } catch (error) {
    console.error('❌ Resend: Email send failed:', error.message);
    
    // Enhanced error logging
    if (error.statusCode) {
      console.error('📧 Resend: Status Code:', error.statusCode);
    }
    
    if (error.message.includes('API key')) {
      console.error('💡 Check your RESEND_API_KEY is correct');
    } else if (error.message.includes('domain')) {
      console.error('💡 Make sure your domain is verified in Resend dashboard');
      console.error('💡 Or use onboarding@resend.dev for testing');
    }
    
    return false;
  }
}

/**
 * Test Resend connectivity (for debugging)
 */
async function testResendConnectivity() {
  console.log('🧪 Testing Resend connectivity...');
  
  if (!resend) {
    console.error('❌ Resend not initialized');
    return false;
  }
  
  try {
    // Resend doesn't have a verify endpoint, so we just check if it's initialized
    console.log('✅ Resend connectivity test passed (API key configured)');
    return true;
  } catch (error) {
    console.error('❌ Resend connectivity test failed:', error.message);
    return false;
  }
}

module.exports = {
  sendEmailWithResend,
  testResendConnectivity
};
