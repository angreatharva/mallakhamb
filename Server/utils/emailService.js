const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Email Service Utility
 * Sends emails using Gmail SMTP with Nodemailer
 */

/**
 * Send an email using Gmail SMTP
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML content of the email
 * @returns {Promise<boolean>} - Returns true if email sent successfully, false otherwise
 */
async function sendEmail(to, subject, html) {
  console.log('📧 Starting email send process...');
  console.log('📧 To:', to);
  console.log('📧 Subject:', subject);
  
  try {
    // Validate required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('❌ Email service error: EMAIL_USER or EMAIL_PASS environment variables are not set');
      console.error('📧 EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not set');
      console.error('📧 EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set (length: ' + process.env.EMAIL_PASS.length + ')' : 'Not set');
      return false;
    }

    // Validate input parameters
    if (!to || !subject || !html) {
      console.error('❌ Email service error: Missing required parameters (to, subject, or html)');
      return false;
    }

    console.log('📧 Creating transporter...');
    
    // Configure Gmail SMTP transport with enhanced settings for production
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Use service instead of manual host/port for better reliability
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates in production
      },
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 60000, // 60 seconds
    });

    console.log('📧 Verifying transporter...');
    
    // Verify transporter configuration
    try {
      await transporter.verify();
      console.log('✅ SMTP transporter verified successfully');
    } catch (verifyError) {
      console.error('❌ SMTP transporter verification failed:', verifyError.message);
      // Continue anyway, sometimes verify fails but sending works
    }

    // Email options
    const mailOptions = {
      from: {
        name: 'Mallakhamb Competition',
        address: process.env.EMAIL_USER
      },
      to: to,
      subject: subject,
      html: html,
      // Add text version as fallback
      text: html.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
    };

    console.log('📧 Sending email...');
    
    // Send email with timeout
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 60 seconds')), 60000)
      )
    ]);
    
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', info.messageId);
    console.log('📧 Response:', info.response);
    
    return true;

  } catch (error) {
    // Enhanced error logging
    console.error('❌ Email service error:', error.message);
    console.error('📧 Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    
    // Log specific Gmail errors
    if (error.code === 'EAUTH') {
      console.error('🔐 Authentication failed - check EMAIL_USER and EMAIL_PASS');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('⏰ Connection timeout - network or firewall issue');
    } else if (error.code === 'ECONNECTION') {
      console.error('🌐 Connection failed - check internet connectivity');
    }
    
    return false;
  }
}

module.exports = {
  sendEmail
};