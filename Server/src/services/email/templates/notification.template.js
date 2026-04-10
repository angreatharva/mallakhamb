/**
 * Notification Email Template
 * 
 * Generates email content for general notifications.
 */

/**
 * Generate notification email content
 * @param {Object} data - Template data
 * @param {string} data.userName - User name
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification message
 * @param {string} data.actionUrl - Action URL (optional)
 * @param {string} data.actionText - Action button text (optional)
 * @returns {Object} Email content with subject, text, and html
 */
function generateNotificationEmail(data) {
  const { userName, title, message, actionUrl, actionText } = data;

  const subject = `${title} - Mallakhamb Competition`;

  const text = `
Hello ${userName || 'User'},

${title}

${message}

${actionUrl ? `${actionText || 'View Details'}: ${actionUrl}` : ''}

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
    .notification-box {
      background-color: #f8f9fa;
      border-left: 4px solid #007bff;
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
    <h2>${title}</h2>
    <p>Hello ${userName || 'User'},</p>
    
    <div class="notification-box">
      <p>${message}</p>
    </div>
    
    ${actionUrl ? `
    <a href="${actionUrl}" class="button">${actionText || 'View Details'}</a>
    ` : ''}
    
    <div class="footer">
      <p>Best regards,<br>Mallakhamb Competition Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

module.exports = { generateNotificationEmail };
