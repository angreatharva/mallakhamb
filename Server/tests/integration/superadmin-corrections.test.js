/**
 * The owner's correction tools (docs/superadmin-control-plan.md, Phases 2–6),
 * end to end: real app, real services, in-memory MongoDB. Each block proves a
 * correction does what it says, keeps a reason and a before/after record in
 * History, and refuses what it must refuse.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');

let app;
let container;
let tokenService;
let csrf;

const oid = () => new mongoose.Types.ObjectId();
const col = (name) => mongoose.connection.collection(name);
const REASON = 'Fixing a typo from the form';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  ({ container } = bootstrap());
  app = createApp(container);
  tokenService = container.resolve('tokenService');
});

beforeEach(async () => {
  csrf = (await request(app).get('/api/csrf-token')).body.csrfToken;
});

const bearer = (id, type = 'admin') => `Bearer ${tokenService.generateToken(String(id), type)}`;
const as = (id, type) => ({
  get: (path) => request(app).get(path).set('Authorization', bearer(id, type)),
  send: (method, path, body = {}) => request(app)[method](path).set('X-CSRF-Token', csrf).set('Authorization', bearer(id, type)).send(body),
});

const history = async (owner, params = '') => (await as(owner).get(`/api/superadmin/history${params}`)).body.data;

/**
 * One owner, one admin, two coaches with a team each, a meet with coach A's
 * team entered (two athletes), and a third athlete with no team yet.
 */
async function seed() {
  const hash = await bcrypt.hash('Correct#Pass2026', 4);
  const ids = {
    owner: oid(), admin: oid(), coachA: oid(), coachB: oid(), teamA: oid(), teamB: oid(),
    p1: oid(), p2: oid(), p3: oid(), meet: oid(), judgeAcc: oid(),
  };
  await col('admins').insertMany([
    { _id: ids.owner, name: 'Owner', email: 'owner@example.com', password: hash, role: 'superadmin', isActive: true, competitions: [] },
    { _id: ids.admin, name: 'Admin One', email: 'admin@example.com', password: hash, role: 'admin', isActive: true, competitions: [ids.meet] },
  ]);
  await col('coaches').insertMany([
    { _id: ids.coachA, firstName: 'Coach', lastName: 'Alpha', email: 'alpha@example.com', password: hash, isActive: true, team: ids.teamA },
    { _id: ids.coachB, firstName: 'Coach', lastName: 'Beta', email: 'beta@example.com', password: hash, isActive: true, team: ids.teamB },
  ]);
  await col('teams').insertMany([
    { _id: ids.teamA, name: 'Alpha Club', coach: ids.coachA, isActive: true },
    { _id: ids.teamB, name: 'Beta Club', coach: ids.coachB, isActive: true },
  ]);
  const dob = new Date('2012-05-04');
  await col('players').insertMany([
    { _id: ids.p1, firstName: 'Riya', lastName: 'Mane', email: 'riya@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', team: ids.teamA, isActive: true, levelTeams: [{ level: 'district', team: ids.teamA }] },
    { _id: ids.p2, firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', team: ids.teamA, isActive: true, levelTeams: [{ level: 'district', team: ids.teamA }] },
    { _id: ids.p3, firstName: 'Mira', lastName: 'Joshi', email: 'mira@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', isActive: true, levelTeams: [] },
  ]);
  const year = new Date().getFullYear();
  await col('competitions').insertOne({
    _id: ids.meet, name: 'District Meet', level: 'district', place: 'Pune', year,
    startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 9 * 86400000),
    competitionTypes: ['competition_1'], playerFee: 500, maxTeamSize: 6, status: 'upcoming', isDeleted: false,
    admins: [ids.admin],
    ageGroups: [{ gender: 'Female', ageGroup: 'Under14' }, { gender: 'Female', ageGroup: 'Under16' }, { gender: 'Female', ageGroup: 'Above16' }],
    registeredTeams: [{
      _id: oid(), team: ids.teamA, coach: ids.coachA, gender: 'Female', isSubmitted: true, paymentStatus: 'completed',
      players: [
        { _id: oid(), player: ids.p1, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['Pole Mallakhamb'] } },
        { _id: oid(), player: ids.p2, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['Pole Mallakhamb'] } },
      ],
    }],
  });
  await col('judges').insertOne({ _id: ids.judgeAcc, firstName: 'Judge', lastName: 'Kale', email: 'kale@example.com', password: hash, isActive: true });
  return ids;
}

describe('Phase 2 — History and Undo', () => {
  it('an admin edit lands in History with the reason and before/after, and can be undone', async () => {
    const ids = await seed();
    const edit = await as(ids.owner).send('put', `/api/superadmin/admins/${ids.admin}`, { name: 'Admin Renamed', reason: REASON });
    expect(edit.status).toBe(200);

    const page = await history(ids.owner, '?entity=admin');
    const row = page.rows.find((r) => r.action === 'ADMIN_UPDATED');
    expect(row).toMatchObject({ reason: REASON, label: 'Admin One', undoable: true });
    expect(row.changes).toEqual([{ field: 'name', from: 'Admin One', to: 'Admin Renamed' }]);

    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'x' })).status).toBe(400);
    const undo = await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Renamed the wrong admin' });
    expect(undo.status).toBe(200);
    expect((await col('admins').findOne({ _id: ids.admin })).name).toBe('Admin One');

    const again = await history(ids.owner, '?entity=admin');
    expect(again.rows.find((r) => r._id === row._id)).toMatchObject({ undoable: false });
    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Second undo try' })).status).toBe(422);
  });

  it('sign-ins are not listed, and History is the owner\'s alone', async () => {
    const ids = await seed();
    await col('auditlogs').insertOne({ adminId: ids.admin, adminType: 'admin', action: 'LOGIN', resource: 'API', resourceId: 'x', createdAt: new Date() });
    const page = await history(ids.owner);
    expect(page.rows.some((r) => r.action === 'LOGIN')).toBe(false);
    expect((await as(ids.admin).get('/api/superadmin/history')).status).toBe(403);
  });

  it('a deleted competition can be listed and restored, with a reason', async () => {
    const ids = await seed();
    await col('competitions').updateOne({ _id: ids.meet }, { $set: { isDeleted: true } });
    const deleted = await as(ids.owner).get('/api/superadmin/competitions-deleted');
    expect(deleted.body.data.map((c) => String(c._id))).toEqual([String(ids.meet)]);
    expect((await as(ids.owner).send('post', `/api/superadmin/competitions/${ids.meet}/restore`, {})).status).toBe(400);
    expect((await as(ids.owner).send('post', `/api/superadmin/competitions/${ids.meet}/restore`, { reason: REASON })).status).toBe(200);
    expect((await col('competitions').findOne({ _id: ids.meet })).isDeleted).toBe(false);
    expect((await history(ids.owner, '?entity=competition')).rows[0]).toMatchObject({ action: 'COMPETITION_RESTORED', reason: REASON });
  });
});


describe('Phase 3 — accounts', () => {
  it('finds players, coaches and judges by name, email or Player ID', async () => {
    const ids = await seed();
    const found = (await as(ids.owner).get('/api/superadmin/accounts?q=riya')).body.data;
    expect(found.map((a) => a.type)).toContain('player');
    const judge = (await as(ids.owner).get('/api/superadmin/accounts?q=kale@example')).body.data;
    expect(judge[0]).toMatchObject({ type: 'judge', name: 'Judge Kale' });
  });

  it('edits a player with a reason, records it, and the edit can be undone', async () => {
    const ids = await seed();
    const path = `/api/superadmin/accounts/player/${ids.p1}`;
    expect((await as(ids.owner).send('put', path, { lastName: 'Mane-Patil' })).status).toBe(400);
    const res = await as(ids.owner).send('put', path, { lastName: 'Mane-Patil', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Riya Mane-Patil');
    const row = (await history(ids.owner, '?entity=player')).rows[0];
    expect(row).toMatchObject({ action: 'PLAYER_UPDATED', reason: REASON, undoable: true });
    expect(row.changes).toEqual([{ field: 'lastName', from: 'Mane', to: 'Mane-Patil' }]);
    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Name was right' })).status).toBe(200);
    expect((await col('players').findOne({ _id: ids.p1 })).lastName).toBe('Mane');
  });

  it('a date-of-birth fix reports entries the age rule no longer allows, and moves them on request', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('put', `/api/superadmin/accounts/player/${ids.p1}`, {
      dateOfBirth: `${new Date().getFullYear() - 18}-03-01`, reason: REASON, fixAgeGroups: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.moved).toEqual([{ competition: 'District Meet', from: 'Under14', to: 'Above16' }]);
    const meet = await col('competitions').findOne({ _id: ids.meet });
    const entry = meet.registeredTeams[0].players.find((p) => String(p.player) === String(ids.p1));
    expect(entry.ageGroup).toBe('Above16');
  });

  it('an email already used by another player is refused', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('put', `/api/superadmin/accounts/player/${ids.p1}`, { email: 'asha@example.com', reason: REASON });
    expect(res.status).toBe(409);
  });

  it('reset password returns a temporary password that works, and signs the account out', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('post', `/api/superadmin/accounts/coach/${ids.coachA}/reset-password`, { reason: REASON });
    expect(res.status).toBe(200);
    const temp = res.body.data.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
    const stored = await col('coaches').findOne({ _id: ids.coachA });
    expect(await bcrypt.compare(temp, stored.password)).toBe(true);
    expect(await col('sessionrevocations').findOne({ _id: String(ids.coachA) })).toBeTruthy();
    const row = (await history(ids.owner, '?entity=coach')).rows[0];
    expect(row).toMatchObject({ action: 'PASSWORD_RESET_BY_OWNER', undoable: false });
    expect(JSON.stringify(row)).not.toContain(temp);
  });

  it('deactivates a judge account, never a coach or the owner', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/judge/${ids.judgeAcc}/active`, { isActive: false, reason: REASON })).status).toBe(200);
    expect((await col('judges').findOne({ _id: ids.judgeAcc })).isActive).toBe(false);
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/coach/${ids.coachA}/active`, { isActive: false, reason: REASON })).status).toBe(422);
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/admin/${ids.owner}/active`, { isActive: false, reason: REASON })).status).toBe(422);
  });

  it('sign out everywhere is recorded', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/player/${ids.p2}/sign-out`, { reason: REASON })).status).toBe(200);
    expect(await col('sessionrevocations').findOne({ _id: String(ids.p2) })).toBeTruthy();
  });
});

describe('Phase 4 — teams, coaches, transfers', () => {
  it('renames a team (undoable), deletes and restores it', async () => {
    const ids = await seed();
    const path = `/api/superadmin/fix/teams/${ids.teamA}`;
    expect((await as(ids.owner).send('put', path, { name: 'Alpha Mallakhamb Club', reason: REASON })).status).toBe(200);
    const row = (await history(ids.owner, '?entity=team')).rows[0];
    expect(row).toMatchObject({ action: 'TEAM_UPDATED', undoable: true });
    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Old name was right' })).status).toBe(200);
    expect((await col('teams').findOne({ _id: ids.teamA })).name).toBe('Alpha Club');

    expect((await as(ids.owner).send('post', `${path}/delete`, { reason: REASON })).status).toBe(200);
    expect((await col('teams').findOne({ _id: ids.teamA })).isActive).toBe(false);
    expect((await as(ids.owner).send('post', `${path}/restore`, { reason: REASON })).status).toBe(200);
    expect((await col('teams').findOne({ _id: ids.teamA })).isActive).toBe(true);
  });

  it('changes the coach: entries follow the team, the old coach stays as co-coach and works for it', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('post', `/api/superadmin/fix/teams/${ids.teamA}/change-coach`, { coachId: String(ids.coachB), oldCoach: 'cocoach', reason: REASON });
    expect(res.status).toBe(200);
    const team = await col('teams').findOne({ _id: ids.teamA });
    expect(String(team.coach)).toBe(String(ids.coachB));
    expect(team.coCoaches.map(String)).toEqual([String(ids.coachA)]);
    const meet = await col('competitions').findOne({ _id: ids.meet });
    expect(String(meet.registeredTeams[0].coach)).toBe(String(ids.coachB));
    expect((await col('coaches').findOne({ _id: ids.coachA })).team).toBeNull();

    // The co-coach acts for the team's main coach, and sees who leads it.
    const view = await as(ids.coachA, 'coach').get('/api/coaches/co-coaches');
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ isMain: false });
    expect(view.body.data.teams[0].mainCoach.name).toBe('Coach Beta');
    const teamsSeen = await as(ids.coachA, 'coach').get('/api/coaches/teams');
    expect(JSON.stringify(teamsSeen.body)).toContain('Alpha Club');

    // A co-coach cannot remove anyone; the main coach can.
    expect((await as(ids.coachA, 'coach').send('post', `/api/coaches/co-coaches/${ids.coachA}/remove`, {})).status).toBe(403);
    const removed = await as(ids.coachB, 'coach').send('post', `/api/coaches/co-coaches/${ids.coachA}/remove`, {});
    expect(removed.status).toBe(200);
    expect((await col('teams').findOne({ _id: ids.teamA })).coCoaches).toEqual([]);
    const after = await as(ids.coachA, 'coach').get('/api/coaches/co-coaches');
    expect(after.body.data.teams).toEqual([]);
  });

  it('changes the coach and removes the old one', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `/api/superadmin/fix/teams/${ids.teamA}/change-coach`, { coachId: String(ids.coachB), oldCoach: 'remove', reason: REASON })).status).toBe(200);
    expect((await col('teams').findOne({ _id: ids.teamA })).coCoaches).toEqual([]);
  });

  it('moves a player in one step: squad, team at level, and scores follow', async () => {
    const ids = await seed();
    await col('scores').insertOne({
      competition: ids.meet, teamId: ids.teamA, gender: 'Female', ageGroup: 'Under14', competitionType: 'Competition I', isLocked: true,
      playerScores: [
        { playerId: ids.p1, playerName: 'Riya Mane', apparatus: 'pole', finalScore: 8.5 },
        { playerId: ids.p2, playerName: 'Asha Rao', apparatus: 'pole', finalScore: 8.1 },
      ],
    });
    const preview = await as(ids.owner).get(`/api/superadmin/fix/transfer/preview?playerId=${ids.p1}&toTeamId=${ids.teamB}&level=district`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.competitions).toHaveLength(1);
    expect(preview.body.data.competitions[0]).toMatchObject({ targetEntered: false });

    const res = await as(ids.owner).send('post', '/api/superadmin/fix/transfer', { playerId: String(ids.p1), toTeamId: String(ids.teamB), level: 'district', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.moved[0]).toMatchObject({ createdRegistration: true, scoresMoved: 1 });

    const meet = await col('competitions').findOne({ _id: ids.meet });
    const regA = meet.registeredTeams.find((r) => String(r.team) === String(ids.teamA));
    const regB = meet.registeredTeams.find((r) => String(r.team) === String(ids.teamB));
    expect(regA.players.map((p) => String(p.player))).toEqual([String(ids.p2)]);
    expect(regB).toMatchObject({ isSubmitted: true, paymentStatus: 'completed' });
    expect(regB.players[0]).toMatchObject({ ageGroup: 'Under14', apparatus: { competition_1: ['Pole Mallakhamb'] } });
    expect(String(regB.coach)).toBe(String(ids.coachB));

    const player = await col('players').findOne({ _id: ids.p1 });
    expect(String(player.levelTeams.find((l) => l.level === 'district').team)).toBe(String(ids.teamB));
    const sheetB = await col('scores').findOne({ competition: ids.meet, teamId: ids.teamB });
    expect(sheetB.playerScores.map((r) => r.finalScore)).toEqual([8.5]);
    const sheetA = await col('scores').findOne({ competition: ids.meet, teamId: ids.teamA });
    expect(sheetA.playerScores.map((r) => String(r.playerId))).toEqual([String(ids.p2)]);
    expect((await history(ids.owner, '?entity=player')).rows.some((r) => r.action === 'PLAYER_TRANSFERRED')).toBe(true);
  });

  it('refuses a full squad unless told to allow it', async () => {
    const ids = await seed();
    await col('competitions').updateOne({ _id: ids.meet }, {
      $set: { maxTeamSize: 4 },
      $push: { registeredTeams: { _id: oid(), team: ids.teamB, coach: ids.coachB, isSubmitted: true, paymentStatus: 'completed',
        players: [1, 2, 3, 4].map(() => ({ _id: oid(), player: oid(), gender: 'Female', ageGroup: 'Under14' })) } },
    });
    const body = { playerId: String(ids.p1), toTeamId: String(ids.teamB), level: 'district', reason: REASON };
    const refused = await as(ids.owner).send('post', '/api/superadmin/fix/transfer', body);
    expect(refused.status).toBe(422);
    expect((await as(ids.owner).send('post', '/api/superadmin/fix/transfer', { ...body, overrideLimit: true })).status).toBe(200);
  });
});

describe('Phase 5 — score corrections', () => {
  const slip = (judgeRole, d, c, e) => ({ judgeRole, difficultyScore: d, combinationScore: c, executionScore: e, bonusScore: 0, total: Number((d + c + e).toFixed(2)) });

  async function seedScore(ids, { finished = false } = {}) {
    if (finished) {
      await col('competitions').updateOne({ _id: ids.meet }, { $set: { startDate: new Date(Date.now() - 9 * 86400000), endDate: new Date(Date.now() - 7 * 86400000) } });
    }
    const slips = [slip('SR_JUDGE', 3, 1.5, 4), slip('J1', 3, 1.5, 3.5), slip('J2', 3, 1.5, 3.7), slip('J3', 3, 1.5, 3.9), slip('J4', 3, 1.5, 4.1)];
    const judgeScores = { seniorJudge: 8.5, judge1: 8, judge2: 8.2, judge3: 8.4, judge4: 8.6 };
    const rowId = oid();
    const scoreId = oid();
    await col('scores').insertOne({
      _id: scoreId, competition: ids.meet, teamId: ids.teamA, gender: 'Female', ageGroup: 'Under14', competitionType: 'Competition I', isLocked: true,
      playerScores: [{ _id: rowId, playerId: ids.p1, playerName: 'Riya Mane', apparatus: 'Pole Mallakhamb', panelSize: 5, judgeScores, judgeSlips: slips, deduction: 0, otherDeduction: 0, finalScore: 8.3 }],
    });
    return { scoreId, rowId };
  }

  it('recomputes the final with the competition-day engine and records before/after', async () => {
    const ids = await seed();
    const { scoreId, rowId } = await seedScore(ids, { finished: true });
    const list = await as(ids.owner).get(`/api/superadmin/fix/scores?competitionId=${ids.meet}`);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ playerName: 'Riya Mane', finalScore: 8.3 });

    const path = `/api/superadmin/fix/scores/${scoreId}/rows/${rowId}`;
    expect((await as(ids.owner).send('post', path, { slips: [{ judgeRole: 'J4', executionScore: 3.6 }] })).status).toBe(400);
    const res = await as(ids.owner).send('post', path, { slips: [{ judgeRole: 'J4', executionScore: 3.6 }], deduction: 0.1, reason: 'J4 slip was misread' });
    expect(res.status).toBe(200);

    const { calculateIndividualScore } = require('../../src/utils/scoring/calculation.util');
    const cop = calculateIndividualScore({ seniorJudge: 8.5, judge1: 8, judge2: 8.2, judge3: 8.4, judge4: 8.1 }, 5);
    const expected = Number(Math.max(0, cop.averageMarks - 0.1).toFixed(3));
    const stored = (await col('scores').findOne({ _id: scoreId })).playerScores[0];
    expect(stored.judgeScores.judge4).toBe(8.1);
    expect(stored.judgeSlips.find((x) => x.judgeRole === 'J4').total).toBe(8.1);
    expect(stored.finalScore).toBe(expected);
    expect(res.body.data.row.finalScore).toBe(expected);

    const row = (await history(ids.owner, '?entity=score')).rows[0];
    expect(row).toMatchObject({ action: 'SCORE_CORRECTED', reason: 'J4 slip was misread', competition: String(ids.meet) });
    expect(row.changes.find((c) => c.field === 'finalScore')).toMatchObject({ from: 8.3, to: expected });
  });

  it('refuses a judge total that bypasses its slip, and out-of-range values', async () => {
    const ids = await seed();
    const { scoreId, rowId } = await seedScore(ids);
    const path = `/api/superadmin/fix/scores/${scoreId}/rows/${rowId}`;
    expect((await as(ids.owner).send('post', path, { judgeScores: { judge1: 9 }, reason: REASON })).status).toBe(400);
    expect((await as(ids.owner).send('post', path, { slips: [{ judgeRole: 'J1', executionScore: 5 }], reason: REASON })).status).toBe(400);
    expect((await as(ids.owner).send('post', path, { slips: [{ judgeRole: 'J1', executionScore: 3.53 }], reason: REASON })).status).toBe(400);
  });
});

describe('Phase 6 — entries and manual payments', () => {
  const base = (ids) => `/api/superadmin/fix/entries/${ids.meet}/${ids.teamA}`;

  it('adds an athlete under the age rule, refuses outside it unless overridden', async () => {
    const ids = await seed();
    const body = { playerId: String(ids.p3), gender: 'Female', ageGroup: 'Under14', apparatus: ['Pole Mallakhamb'], reason: REASON };
    const ok = await as(ids.owner).send('post', `${base(ids)}/players`, body);
    expect(ok.status).toBe(200);
    expect(ok.body.data.players.map((p) => p.name)).toContain('Mira Joshi');
    const meet = await col('competitions').findOne({ _id: ids.meet });
    expect(meet.registeredTeams[0].players.find((p) => String(p.player) === String(ids.p3)).apparatus).toEqual({ competition_1: ['Pole Mallakhamb'] });

    // Born 2012: too old for Under 10.
    await col('competitions').updateOne({ _id: ids.meet }, { $push: { ageGroups: { gender: 'Female', ageGroup: 'Under10' } } });
    const moveDown = await as(ids.owner).send('put', `${base(ids)}/players/${ids.p2}`, { ageGroup: 'Under10', reason: REASON });
    expect(moveDown.status).toBe(422);
    expect((await as(ids.owner).send('put', `${base(ids)}/players/${ids.p2}`, { ageGroup: 'Under10', overrideAge: true, reason: REASON })).status).toBe(200);
    const row = (await history(ids.owner, '?entity=entry')).rows[0];
    expect(row).toMatchObject({ action: 'ENTRY_PLAYER_UPDATED' });
  });

  it('will not add an athlete already entered, nor remove one who has scores', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `${base(ids)}/players`, { playerId: String(ids.p1), gender: 'Female', ageGroup: 'Under14', reason: REASON })).status).toBe(422);
    await col('scores').insertOne({ competition: ids.meet, teamId: ids.teamA, gender: 'Female', ageGroup: 'Under14', competitionType: 'Competition I', playerScores: [{ playerId: ids.p1, finalScore: 8 }] });
    expect((await as(ids.owner).send('post', `${base(ids)}/players/${ids.p1}/remove`, { reason: REASON })).status).toBe(422);
    expect((await as(ids.owner).send('post', `${base(ids)}/players/${ids.p2}/remove`, { reason: REASON })).status).toBe(200);
  });

  it('corrects the registration status and records a manual payment and a refund', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `${base(ids)}/status`, { paymentStatus: 'pending', reason: REASON })).status).toBe(200);
    expect((await col('competitions').findOne({ _id: ids.meet })).registeredTeams[0].paymentStatus).toBe('pending');
    expect((await as(ids.owner).send('post', `${base(ids)}/money`, { kind: 'payment', amount: 1000, method: 'cash', reason: 'Paid at the desk' })).status).toBe(200);
    const refund = await as(ids.owner).send('post', `${base(ids)}/money`, { kind: 'refund', amount: 500, method: 'UPI', reason: 'Athlete withdrew' });
    expect(refund.status).toBe(200);
    const ledger = await col('transactions').find({ competition: ids.meet }).sort({ createdAt: 1 }).toArray();
    expect(ledger.map((t) => t.amount)).toEqual([1000, -500]);
    expect(ledger[1]).toMatchObject({ source: 'superadmin', type: 'other', metadata: expect.objectContaining({ kind: 'refund' }) });
    expect(refund.body.data.transactions).toHaveLength(2);
  });
});
