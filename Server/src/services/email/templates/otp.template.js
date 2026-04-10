/**
 * OTP Email Template
 * 
 * Generates email content for OTP verification.
 */

/**
 * Generate OTP email content
 * @param {Object} data - Template data
 * @param {string} data.otp - OTP code
 * @param {string} data.userName - User name
 * @param {number} data.expiryMinutes - OTP expiry time in minutes
 * @returns {Object} Email content with subject, text, and html
 */
function generateOTPEmail(data) {
  const { otp, userName, expiryMinutes } = data;

  const subject = 'Your OTP Code - Mallakhamb Competition';

  const text = `
Hello ${userName || 'User'},

Your OTP code is: ${otp}

This code will expire in ${expiryMinutes} minutes.

If you did not request this code, please ignore this email.

Best regards,
Mallakhamb Competition Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .otp-box {
      background-color: #f4f4f4;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .otp-code {
      font-size: 32px;
      font-weight: bold;
      color: #007bff;
      letter-spacing: 5px;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>OTP Verification</h2>
    <p>Hello ${userName || 'User'},</p>
    <p>Your OTP code is:</p>
    
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
    </div>
    
    <p>This code will expire in <strong>${expiryMinutes} minutes</strong>.</p>
    <p>If you did not request this code, please ignore this email.</p>
    
    <div class="footer">
      <p>Best regards,<br>Mallakhamb Competition Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

module.exports = { generateOTPEmail };
