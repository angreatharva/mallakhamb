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
  try {
    // Validate required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Email service error: EMAIL_USER or EMAIL_PASS environment variables are not set');
      return false;
    }

    // Validate input parameters
    if (!to || !subject || !html) {
      console.error('Email service error: Missing required parameters (to, subject, or html)');
      return false;
    }

    // Configure Gmail SMTP transport with TLS
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use TLS (STARTTLS)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: html
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    return true;

  } catch (error) {
    // Log error without throwing to caller
    console.error('Email service error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    return false;
  }
}

module.exports = {
  sendEmail
};
