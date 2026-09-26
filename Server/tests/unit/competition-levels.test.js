/**
 * DSO and University are competition levels: the model stores them and both
 * the create and update validators accept them, from the one list in
 * config/competition-levels. An unknown level is still refused everywhere.
 */

const { validationResult } = require('express-validator');
const Competition = require('../../src/models/Competition');
const validators = require('../../src/validators/competition.validator');
const { COMPETITION_LEVELS } = require('../../src/config/competition-levels');

/** Messages the level rule alone produces for a body. */
async function levelErrors(chain, level) {
  const req = { body: { level }, params: {}, query: {} };
  for (const rule of chain) await rule.run(req);
  return validationResult(req).array().filter((e) => e.path === 'level').map((e) => e.msg);
}

describe('competition levels', () => {
  it('lists DSO and University after the district → international ladder', () => {
    expect(COMPETITION_LEVELS).toEqual(['district', 'state', 'national', 'international', 'dso', 'university']);
  });

  it('is the list the Competition model enforces', () => {
    expect(Competition.schema.path('level').enumValues).toEqual([...COMPETITION_LEVELS]);
  });

  it.each(['dso', 'university'])('the model stores "%s"', (level) => {
    const doc = new Competition({ name: 'Test Meet', level });
    expect(doc.validateSync()?.errors?.level).toBeUndefined();
  });

  it('the model still refuses an unknown level, naming the new ones', () => {
    const err = new Competition({ name: 'Test Meet', level: 'college' }).validateSync().errors.level;
    expect(err.message).toMatch(/dso, or university/);
  });

  it.each(['dso', 'university'])('create and update accept "%s"', async (level) => {
    expect(await levelErrors(validators.createCompetition(), level)).toEqual([]);
    expect(await levelErrors(validators.updateCompetition(), level)).toEqual([]);
  });

  it('create and update refuse an unknown level', async () => {
    expect(await levelErrors(validators.createCompetition(), 'college')).not.toEqual([]);
    expect(await levelErrors(validators.updateCompetition(), 'college')).not.toEqual([]);
  });
});
