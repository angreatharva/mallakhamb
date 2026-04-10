/**
 * Password Reset Email Template
 * 
 * Generates email content for password reset confirmation.
 */

/**
 * Generate password reset email content
 * @param {Object} data - Template data
 * @param {string} data.userName - User name
 * @param {string} data.resetLink - Password reset link (optional)
 * @returns {Object} Email content with subject, text, and html
 */
function generatePasswordResetEmail(data) {
  const { userName, resetLink } = data;

  const subject = 'Password Reset Confirmation - Mallakhamb Competition';

  const text = `
Hello ${userName || 'User'},

Your password has been successfully reset.

${resetLink ? `If you did not make this change, please reset your password immediately using this link:\n${resetLink}` : 'If you did not make this change, please contact support immediately.'}

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
    .alert-box {
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 5px;
      padding: 15px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      margin: 10px 0;
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
    <h2>Password Reset Confirmation</h2>
    <p>Hello ${userName || 'User'},</p>
    
    <div class="alert-box">
      <p><strong>Your password has been successfully reset.</strong></p>
    </div>
    
    ${resetLink ? `
    <p>If you did not make this change, please reset your password immediately:</p>
    <a href="${resetLink}" class="button">Reset Password</a>
    ` : `
    <p>If you did not make this change, please contact support immediately.</p>
    `}
    
    <div class="footer">
      <p>Best regards,<br>Mallakhamb Competition Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

module.exports = { generatePasswordResetEmail };
