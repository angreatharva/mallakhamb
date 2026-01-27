const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Email Service Utility
 * Sends emails using Gmail SMTP with Nodemailer
 * Multiple configurations to handle different hosting environments
 */

/**
 * Create transporter with different configurations for different environments
 */
function createTransporter() {
  const configs = [
    // Configuration 1: SSL on port 465 (most compatible with cloud hosting)
    {
      name: 'SSL-465',
      config: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // Use SSL
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 1
      }
    },
    // Configuration 2: TLS on port 587 (standard)
    {
      name: 'TLS-587',
      config: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000
      }
    },
    // Configuration 3: Gmail service (let nodemailer handle the details)
    {
      name: 'Gmail-Service',
      config: {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000
      }
    }
  ];

  // Try configurations in order
  for (const { name, config } of configs) {
    console.log(`📧 Trying configuration: ${name}`);
    try {
      const transporter = nodemailer.createTransport(config);
      return { transporter, configName: name };
    } catch (error) {
      console.error(`❌ Configuration ${name} failed:`, error.message);
      continue;
    }
  }

  throw new Error('All email configurations failed');
}

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
  console.log('📧 Environment:', process.env.NODE_ENV || 'development');
  
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
    
    // Create transporter with fallback configurations
    const { transporter, configName } = createTransporter();
    console.log(`📧 Using configuration: ${configName}`);

    console.log('📧 Verifying transporter...');
    
    // Verify transporter configuration with timeout
    try {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Verification timeout')), 30000)
        )
      ]);
      console.log('✅ SMTP transporter verified successfully');
    } catch (verifyError) {
      console.error('❌ SMTP transporter verification failed:', verifyError.message);
      console.log('📧 Continuing without verification (sometimes verification fails but sending works)');
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
        setTimeout(() => reject(new Error('Email send timeout after 90 seconds')), 90000)
      )
    ]);
    
    console.log('✅ Email sent successfully!');
    console.log('📧 Configuration used:', configName);
    console.log('📧 Message ID:', info.messageId);
    console.log('📧 Response:', info.response);
    
    // Close transporter
    transporter.close();
    
    return true;

  } catch (error) {
    // Enhanced error logging
    console.error('❌ Email service error:', error.message);
    console.error('📧 Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      errno: error.errno,
      syscall: error.syscall
    });
    
    // Log specific Gmail errors
    if (error.code === 'EAUTH') {
      console.error('🔐 Authentication failed - check EMAIL_USER and EMAIL_PASS');
      console.error('💡 Make sure you are using Gmail App Password, not regular password');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('⏰ Connection timeout - likely network/firewall blocking SMTP');
      console.error('💡 Render may be blocking SMTP ports. Consider using SendGrid or similar service.');
    } else if (error.code === 'ECONNECTION' || error.code === 'ENOTFOUND') {
      console.error('🌐 Connection failed - DNS or network connectivity issue');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Connection refused - SMTP server rejected connection');
      console.error('💡 This usually means SMTP ports are blocked by hosting provider');
    }
    
    return false;
  }
}

/**
 * Test email connectivity (for debugging)
 */
async function testEmailConnectivity() {
  console.log('🧪 Testing email connectivity...');
  
  try {
    const { transporter, configName } = createTransporter();
    console.log(`🧪 Testing configuration: ${configName}`);
    
    const result = await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), 30000)
      )
    ]);
    
    console.log('✅ Email connectivity test passed');
    transporter.close();
    return true;
  } catch (error) {
    console.error('❌ Email connectivity test failed:', error.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  testEmailConnectivity
};