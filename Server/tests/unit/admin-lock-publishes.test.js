/**
 * An admin's Lock & Submit publishes the sheet (bug found by the e2e
 * corrections step, 2026-11-09).
 *
 * "Unlock all for judges" clears every athlete's Final Submit, so an admin who
 * unlocked a sheet to correct a time and then locked it again left the whole
 * category off the public board. The controller now marks every athlete with
 * marks as finalized when an admin saves the sheet locked — and only then.
 */
const createAdminController = require('../../src/controllers/admin.controller');

function controllerWith(saveScores) {
  const services = {
    adminService: { saveScores },
    judgeAccountService: {},
    tokenService: {},
    config: {},
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    judgeRepository: {},
  };
  return createAdminController({ resolve: (name) => services[name] });
}

const run = async (body, userType = 'admin') => {
  const saveScores = jest.fn(async () => ({ ok: true }));
  const controller = controllerWith(saveScores);
  const req = {
    body,
    userType,
    user: { _id: 'u1', role: userType },
    competitionId: '64b000000000000000000001',
    judgeAssignments: [],
    params: {},
    query: {},
  };
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  await new Promise((resolve, reject) => {
    const out = controller.saveScores(req, res, (err) => (err ? reject(err) : resolve()));
    Promise.resolve(out).then(resolve, reject);
  });
  return saveScores.mock.calls[0]?.[0];
};

const rows = [
  { playerId: 'p1', playerName: 'Marked', judgeScores: { seniorJudge: 8.4, judge1: 8.4 }, time: '75' },
  { playerId: 'p2', playerName: 'Unmarked', judgeScores: { seniorJudge: 0, judge1: 0 }, time: '' },
];

describe('admin Lock & Submit', () => {
  test('finalizes every athlete with marks when the sheet is locked', async () => {
    const saved = await run({ teamId: 't1', gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1', isLocked: true, playerScores: rows });
    expect(saved.playerScores[0].isFinalized).toBe(true);
    expect(saved.playerScores[0].finalizedAt).toBeInstanceOf(Date);
    expect(saved.playerScores[1].isFinalized).toBeUndefined();
  });

  test('a draft save finalizes nobody', async () => {
    const saved = await run({ teamId: 't1', gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1', isLocked: false, playerScores: rows });
    expect(saved.playerScores.every((ps) => ps.isFinalized === undefined)).toBe(true);
  });
});
