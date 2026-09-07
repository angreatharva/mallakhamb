/**
 * A registration write must land on the team it names, whatever else moved.
 *
 * `Competition.registeredTeams` is an embedded array, and the submission and
 * payment writes used to address it by POSITION — `findIndex` on a document
 * read moments earlier, then `$set` on
 * `` `registeredTeams.${index}.isSubmitted` ``.
 *
 * `DELETE /api/competitions/:competitionId/register/:teamId` splices that array
 * and is reachable by any coach. So a coach withdrawing between another coach's
 * read and their payment write shifted every later index down by one, and the
 * write landed on somebody else's registration — marking THEIR team submitted
 * and paid against money that was never theirs. Both writes succeed, so nothing
 * reports it; the wrong team simply appears as entered.
 *
 * These tests drive the real repository against a real MongoDB, because the
 * whole question is what the database ends up holding.
 */

const mongoose = require('mongoose');

const CompetitionRepository = require('../../src/repositories/competition.repository');
const Competition = require('../../models/Competition');

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const oid = () => new mongoose.Types.ObjectId();

/**
 * A competition with three registrations, in array order A, B, C.
 * @returns {Promise<{competitionId, teams: {A, B, C}, coaches: {A, B, C}, players: {A, C}}>}
 */
async function seedThreeRegistrations() {
  const teams = { A: oid(), B: oid(), C: oid() };
  const coaches = { A: oid(), B: oid(), C: oid() };
  const players = { A: oid(), C: oid() };

  const competition = await Competition.create({
    name: 'Targeting Meet',
    level: 'state',
    place: 'Mumbai',
    year: 2026,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-11-03'),
    playerFee: 100,
    registeredTeams: [
      { team: teams.A, coach: coaches.A, players: [{ player: players.A, ageGroup: 'Under14', gender: 'Male' }] },
      { team: teams.B, coach: coaches.B, players: [] },
      { team: teams.C, coach: coaches.C, players: [{ player: players.C, ageGroup: 'Under14', gender: 'Male' }] },
    ],
  });

  return { competitionId: competition._id, teams, coaches, players };
}

/** @param {*} competitionId @param {*} teamId */
async function registrationFor(competitionId, teamId) {
  const doc = await Competition.findById(competitionId).lean();
  return (doc.registeredTeams || []).find((rt) => String(rt.team) === String(teamId));
}

describe('registration writes are addressed by team, not by array position', () => {
  let repository;

  beforeEach(() => {
    repository = new CompetitionRepository(quiet);
  });

  it('marks the right team submitted after an earlier registration is withdrawn', async () => {
    const { competitionId, teams } = await seedThreeRegistrations();

    // B withdraws. C now sits where B was; A is unmoved.
    await repository.removeTeam(competitionId, teams.B);

    // C pays. Addressed by team, this must reach C — addressed by the position
    // C held when it was read (index 2), it would reach nothing, and had A read
    // index 1 earlier it would have reached C by mistake.
    const applied = await repository.updateRegistrationFields(competitionId, teams.C, {
      isSubmitted: true,
      paymentStatus: 'completed',
      paymentAmount: 4200,
    });

    expect(applied).toBe(true);

    const a = await registrationFor(competitionId, teams.A);
    const c = await registrationFor(competitionId, teams.C);

    expect(c.isSubmitted).toBe(true);
    expect(c.paymentStatus).toBe('completed');
    expect(c.paymentAmount).toBe(4200);

    // A paid nothing and submitted nothing.
    expect(a.isSubmitted).toBe(false);
    expect(a.paymentStatus).toBe('pending');
    expect(a.paymentAmount).toBeUndefined();
  });

  it('reports false rather than writing when the team is not registered', async () => {
    const { competitionId } = await seedThreeRegistrations();

    const applied = await repository.updateRegistrationFields(competitionId, oid(), {
      isSubmitted: true,
    });

    expect(applied).toBe(false);

    const doc = await Competition.findById(competitionId).lean();
    expect(doc.registeredTeams.every((rt) => rt.isSubmitted === false)).toBe(true);
  });

  it('updates one athlete\'s squad place without touching the other team\'s', async () => {
    const { competitionId, teams, players } = await seedThreeRegistrations();

    await repository.removeTeam(competitionId, teams.B);

    const applied = await repository.updatePlayerInRegistration(
      competitionId,
      teams.C,
      players.C,
      { ageGroup: 'Under16', gender: 'Male' }
    );

    expect(applied).toBe(true);

    const a = await registrationFor(competitionId, teams.A);
    const c = await registrationFor(competitionId, teams.C);

    expect(c.players[0].ageGroup).toBe('Under16');
    // A's athlete is where the double-index write would have landed.
    expect(a.players[0].ageGroup).toBe('Under14');
  });

  it('removeTeam keeps a concurrent squad edit made after it read the document', async () => {
    const { competitionId, teams, players } = await seedThreeRegistrations();
    const newPlayer = oid();

    /*
     * The interleaving is the whole point, so it is written out explicitly.
     *
     * The OLD removeTeam read the competition, filtered `registeredTeams` in
     * JavaScript, and called `.save()`. Assigning the whole path marks it dirty,
     * so Mongoose emits a `$set` of every element — as it was at READ time.
     * Anything written in between is gone.
     *
     * Step 1 is that read. Step 2 is a coach adding an athlete to a DIFFERENT
     * team. Step 3 is the removal landing.
     */

    // 1. what the old implementation would have held
    const asRead = await Competition.findById(competitionId);

    // 2. a concurrent, unrelated squad edit
    await repository.addPlayerToRegistration(competitionId, teams.A, {
      player: newPlayer, ageGroup: 'Under18', gender: 'Male',
    });

    // 3a. the old sequence, reproduced — it loses the edit
    asRead.registeredTeams = asRead.registeredTeams.filter(
      (rt) => String(rt.team) !== String(teams.B)
    );
    await asRead.save();

    let a = await registrationFor(competitionId, teams.A);
    expect(a.players).toHaveLength(1); // the athlete added in step 2 is gone

    // 3b. the current sequence — same interleaving, edit survives
    await Competition.findByIdAndUpdate(competitionId, {
      $push: { registeredTeams: { team: teams.B, coach: oid(), players: [] } },
    });
    await repository.addPlayerToRegistration(competitionId, teams.A, {
      player: newPlayer, ageGroup: 'Under18', gender: 'Male',
    });

    await repository.removeTeam(competitionId, teams.B);

    a = await registrationFor(competitionId, teams.A);
    const b = await registrationFor(competitionId, teams.B);

    expect(b).toBeUndefined();
    expect(a.players).toHaveLength(2);
    expect(a.players.map((p) => String(p.player))).toContain(String(newPlayer));
    expect(a.players.map((p) => String(p.player))).toContain(String(players.A));
  });

  it('a positional write lands on the wrong team once the array has shifted', async () => {
    const { competitionId, teams } = await seedThreeRegistrations();

    // A coach reads the competition and notes where their registration sits.
    // C is at index 2.
    const asRead = await Competition.findById(competitionId).lean();
    const positionOfC = asRead.registeredTeams.findIndex(
      (rt) => String(rt.team) === String(teams.C)
    );
    expect(positionOfC).toBe(2);

    // B withdraws. C is now at index 1; index 2 no longer exists.
    await repository.removeTeam(competitionId, teams.B);

    // The OLD write, reproduced: addressed by the position C held when read.
    await Competition.updateOne(
      { _id: competitionId },
      { $set: { [`registeredTeams.${positionOfC}.isSubmitted`]: true } }
    );

    // It did not reach C — and on a shift of one rather than two it would have
    // reached whichever team took that slot.
    const cAfterPositional = await registrationFor(competitionId, teams.C);
    expect(cAfterPositional.isSubmitted).toBe(false);

    // The current write is addressed by team and reaches C wherever it sits.
    await repository.updateRegistrationFields(competitionId, teams.C, { isSubmitted: true });

    const c = await registrationFor(competitionId, teams.C);
    const a = await registrationFor(competitionId, teams.A);
    expect(c.isSubmitted).toBe(true);
    expect(a.isSubmitted).toBe(false);
  });
});
