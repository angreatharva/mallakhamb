/**
 * The Player ID of a player with no email goes to their coach — the only adult
 * on record with an inbox — and never carries a password.
 */

const OTPService = require('../../../../src/services/auth/otp.service');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const config = { get: () => 'test' };
const PLAYER = { _id: 'p1', firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616' };

function build(coach) {
  const emailService = { sendNotification: jest.fn().mockResolvedValue(true) };
  const coachRepository = { findById: jest.fn().mockResolvedValue(coach) };
  const service = new OTPService(config, logger, {}, coachRepository, null, emailService);
  return { service, emailService, coachRepository };
}

describe('notifyCoachOfPlayerId', () => {
  test('mails the coach the Player ID when they registered the player', async () => {
    const { service, emailService } = build({ _id: 'c1', firstName: 'Ravi', email: 'ravi@example.com' });
    await service.notifyCoachOfPlayerId('c1', PLAYER, 'registered-by-coach', 'Shivaji Club');

    expect(emailService.sendNotification).toHaveBeenCalledTimes(1);
    const [to, { title, message }] = emailService.sendNotification.mock.calls[0];
    expect(to).toBe('ravi@example.com');
    expect(title).toBe('Player ID for Aarav Patil');
    expect(message).toContain('Player ID: aarav.patil.150616');
    expect(message).toContain('Shivaji Club');
    expect(message).toContain('default player password');
  });

  test('says the player joined when they registered themselves', async () => {
    const { service, emailService } = build({ _id: 'c1', firstName: 'Ravi', email: 'ravi@example.com' });
    await service.notifyCoachOfPlayerId('c1', PLAYER, 'joined-team');
    expect(emailService.sendNotification.mock.calls[0][1].message).toContain('has joined your team');
  });

  test('sends nothing without a Player ID or a coach email, and never rejects', async () => {
    const noEmail = build({ _id: 'c1', firstName: 'Ravi' });
    await noEmail.service.notifyCoachOfPlayerId('c1', PLAYER, 'joined-team');
    expect(noEmail.emailService.sendNotification).not.toHaveBeenCalled();

    const noId = build({ _id: 'c1', email: 'ravi@example.com' });
    await noId.service.notifyCoachOfPlayerId('c1', { ...PLAYER, loginId: null }, 'joined-team');
    expect(noId.emailService.sendNotification).not.toHaveBeenCalled();

    const broken = build(null);
    broken.coachRepository.findById.mockRejectedValue(new Error('db down'));
    await expect(broken.service.notifyCoachOfPlayerId('c1', PLAYER, 'joined-team')).resolves.toBeUndefined();
  });
});
