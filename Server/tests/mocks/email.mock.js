/**
 * Mock Email Service
 *
 * A Jest-compatible mock for the EmailService that records calls
 * without sending real emails. Useful for verifying that emails
 * are triggered with the correct arguments.
 *
 * Requirements: 15.5
 */

/**
 * Create a fresh mock email service instance.
 * Each call returns a new object so tests are isolated.
 *
 * @returns {object} Mock email service
 */
const createMockEmailService = () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  sendOTP: jest.fn().mockResolvedValue({ messageId: 'mock-otp-id' }),
  sendPasswordReset: jest.fn().mockResolvedValue({ messageId: 'mock-reset-id' }),
  sendNotification: jest.fn().mockResolvedValue({ messageId: 'mock-notification-id' }),
  validateEmail: jest.fn().mockReturnValue(true),
  verifyConfiguration: jest.fn().mockResolvedValue(true),
  getDeliveryStats: jest.fn().mockReturnValue({
    sent: 0,
    failed: 0,
    pending: 0,
  }),
  previewEmail: jest.fn().mockResolvedValue('<html>Preview</html>'),
  queueEmail: jest.fn().mockResolvedValue(undefined),
  processQueue: jest.fn().mockResolvedValue(undefined),
});

/**
 * Shared singleton mock (reset between tests with jest.clearAllMocks()).
 */
const mockEmailService = createMockEmailService();

module.exports = {
  createMockEmailService,
  mockEmailService,
};
