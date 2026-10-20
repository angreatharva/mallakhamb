/**
 * The meets a player chooses from after picking their team (Level → Team →
 * Competition): every meet the team is entered in, whether or not the coach
 * has placed the player in an age group yet.
 */

const AuthenticationService = require('../../src/services/auth/authentication.service');
const PlayerRepository = require('../../src/repositories/player.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Competition = require('../../src/models/Competition');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function build() {
  return new AuthenticationService(
    new PlayerRepository(noopLogger),
    null, null, null,
    new CompetitionRepository(noopLogger),
    null, null,
    noopLogger
  );
}

const meet = (name, registeredTeams) => Competition.collection.insertOne({
  name, level: 'state', place: 'Nagpur', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-02'),
  isDeleted: false, registeredTeams,
});

test('lists every meet the player team is entered in, rostered or not', async () => {
  const coach = await Coach.create({ firstName: 'Ravi', lastName: 'Kale', email: 'ravi@example.com', password: 'CoachPass1' });
  const team = await Team.create({ name: 'Shivaji Club', coach: coach._id });
  const other = await Team.create({ name: 'Other Club', coach: coach._id });
  const player = await Player.create({
    firstName: 'Aarav', lastName: 'Patil', email: 'aarav@example.com', phone: '9876543210',
    dateOfBirth: new Date('2000-01-01'), gender: 'Male', password: 'Player123', team: team._id,
  });

  await meet('Entered, not rostered', [{ team: team._id, coach: coach._id, isActive: true, players: [] }]);
  await meet('Entered and rostered', [{ team: team._id, coach: coach._id, isActive: true, players: [{ player: player._id, ageGroup: 'Above18', gender: 'Male' }] }]);
  await meet('Withdrawn', [{ team: team._id, coach: coach._id, isActive: false, players: [] }]);
  // Another team active, this one withdrawn: an unpaired match must not count.
  await meet('Other team only', [
    { team: other._id, coach: coach._id, isActive: true, players: [] },
    { team: team._id, coach: coach._id, isActive: false, players: [] },
  ]);

  const names = (await build().getAssignedCompetitions(String(player._id), 'player')).map((c) => c.name).sort();
  expect(names).toEqual(['Entered and rostered', 'Entered, not rostered']);
});

test('a player with no team has none', async () => {
  const player = await Player.create({
    firstName: 'Diya', lastName: 'Rao', email: 'diya@example.com', phone: '9876543211',
    dateOfBirth: new Date('2000-01-01'), gender: 'Female', password: 'Player123',
  });
  expect(await build().getAssignedCompetitions(String(player._id), 'player')).toEqual([]);
});
