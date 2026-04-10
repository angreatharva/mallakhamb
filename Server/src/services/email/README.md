# Email Service

Unified email service with multiple provider support, template rendering, retry logic, queueing, and delivery tracking.

## Features

- **Multiple Provider Support**: Nodemailer (SMTP) and Resend adapters
- **Template Rendering**: Pre-built templates for OTP, password reset, and notifications
- **Retry Logic**: Exponential backoff retry on failures (max 3 attempts)
- **Email Queueing**: Asynchronous email sending with queue processing
- **Delivery Tracking**: Track email delivery status and statistics
- **Email Validation**: Validates email addresses before sending
- **Development Preview**: Preview email templates without sending

## Architecture

```
EmailService
├── IEmailProvider (interface)
│   ├── NodemailerAdapter (SMTP)
│   └── ResendAdapter (Resend API)
├── Templates
│   ├── otp.template.js
│   ├── password-reset.template.js
│   └── notification.template.js
└── email.service.js (main service)
```

## Configuration

The email service is configured through the ConfigManager:

```javascript
{
  email: {
    provider: 'nodemailer', // or 'resend'
    from: 'noreply@example.com',
    nodemailer: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'user@example.com',
      password: 'password'
    },
    resend: {
      apiKey: 'your-resend-api-key',
      fromEmail: 'noreply@example.com'
    }
  }
}
```

## Usage

### Basic Email Sending

```javascript
const emailService = container.resolve('emailService');

await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  text: 'Welcome to our platform!',
  html: '<p>Welcome to our platform!</p>'
});
```

### Send OTP Email

```javascript
await emailService.sendOTP('user@example.com', {
  otp: '123456',
  userName: 'John Doe',
  expiryMinutes: 10
});
```

### Send Password Reset Email

```javascript
await emailService.sendPasswordReset('user@example.com', {
  userName: 'John Doe',
  resetLink: 'https://example.com/reset?token=abc123'
});
```

### Send Notification Email

```javascript
await emailService.sendNotification('user@example.com', {
  userName: 'John Doe',
  title: 'Competition Starting Soon',
  message: 'Your competition starts in 1 hour.',
  actionUrl: 'https://example.com/competition/123',
  actionText: 'View Competition'
});
```

### Queue Email for Async Sending

```javascript
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  text: 'Welcome!',
  queue: true // Add to queue instead of sending immediately
});
```

### Preview Email Template

```javascript
const preview = emailService.previewEmail('otp', {
  otp: '123456',
  userName: 'John Doe',
  expiryMinutes: 10
});

console.log(preview.subject);
console.log(preview.text);
console.log(preview.html);
```

### Get Delivery Statistics

```javascript
const stats = emailService.getDeliveryStats();
console.log(stats);
// {
//   total: 100,
//   successful: 95,
//   failed: 5,
//   successRate: '95.00',
//   queueSize: 3
// }
```

### Verify Configuration

```javascript
const isValid = await emailService.verifyConfiguration();
if (!isValid) {
  console.error('Email service configuration is invalid');
}
```

## Integration with OTP Service

The OTP service automatically uses the email service when available:

```javascript
// In OTPService constructor
constructor(configManager, logger, playerRepository, coachRepository, adminRepository, emailService = null) {
  this.emailService = emailService;
}

// When generating OTP
if (this.emailService) {
  await this.emailService.sendOTP(user.email, {
    otp,
    userName: user.name,
    expiryMinutes: otpExpiryMinutes
  });
}
```

## Error Handling

The email service handles errors gracefully:

- **Invalid Email**: Throws error immediately
- **Send Failure**: Retries up to 3 times with exponential backoff
- **Max Retries Reached**: Logs error and tracks failed delivery
- **Queue Processing**: Continues processing queue even if individual emails fail

## Testing

Run the email service tests:

```bash
npm test -- email.service.test.js
```

## Requirements Satisfied

- **21.1**: Email service interface abstracts email sending ✓
- **21.2**: Multiple providers (Nodemailer, Resend) through adapter pattern ✓
- **21.3**: Template rendering for OTP, password reset, notifications ✓
- **21.4**: Retry logic with exponential backoff ✓
- **21.5**: Email queueing for asynchronous sending ✓
- **21.6**: Delivery tracking ✓
- **21.7**: Email preview functionality ✓
- **21.8**: Email address validation ✓

## Files Created

- `email-provider.interface.js` - Provider interface
- `nodemailer.adapter.js` - Nodemailer SMTP adapter
- `resend.adapter.js` - Resend API adapter
- `email.service.js` - Main email service
- `templates/otp.template.js` - OTP email template
- `templates/password-reset.template.js` - Password reset template
- `templates/notification.template.js` - Notification template
- `email.service.test.js` - Unit tests (25 tests, all passing)
- `README.md` - This documentation
