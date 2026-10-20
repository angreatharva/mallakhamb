/**
 * Joining a team mails the new coach the Player ID — only for a player with no
 * email, and only when the team actually changes.
 */

const PlayerService = require('../../../src/services/user/player.service');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function build(player) {
  const otpService = { notifyCoachOfPlayerId: jest.fn() };
  const playerRepository = {
    findById: jest.fn().mockResolvedValue(player),
    updateById: jest.fn(async (id, updates) => ({ ...player, ...updates })),
  };
  const teamRepository = { findById: jest.fn().mockResolvedValue({ _id: 't2', name: 'Shivaji Club', coach: 'c2' }) };
  const authenticationService = { otpService, generateToken: jest.fn().mockResolvedValue({ token: 't' }) };
  const service = new PlayerService(playerRepository, teamRepository, logger, null, authenticationService);
  return { service, otpService };
}

const base = { _id: 'p1', firstName: 'Aarav', lastName: 'Patil', loginId: 'aarav.patil.150616' };

describe('joinTeam → coach mail', () => {
  test('a no-email player joining a new team: the coach gets the Player ID', async () => {
    const { service, otpService } = build({ ...base, emailType: 'none', team: 't1' });
    await service.joinTeam('p1', 't2');
    expect(otpService.notifyCoachOfPlayerId).toHaveBeenCalledWith('c2', expect.objectContaining({ loginId: base.loginId }), 'joined-team', 'Shivaji Club');
  });

  test('not for a player with an email, nor for re-joining the same team', async () => {
    const own = build({ ...base, emailType: 'self', email: 'a@example.com', team: null });
    await own.service.joinTeam('p1', 't2');
    expect(own.otpService.notifyCoachOfPlayerId).not.toHaveBeenCalled();

    const same = build({ ...base, emailType: 'none', team: 't2' });
    await same.service.joinTeam('p1', 't2');
    expect(same.otpService.notifyCoachOfPlayerId).not.toHaveBeenCalled();
  });
});
