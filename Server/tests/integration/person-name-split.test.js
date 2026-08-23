/**
 * Migration 006 — coaches and judges gain a first and last name.
 *
 * Run against real models on the in-memory server, because what can go wrong
 * here is storage-shaped: leaving a coach with no first name (their account
 * then fails validation on its next save), or dropping the second half of a
 * three-word name.
 */

const { up, down, splitName } = require('../../src/migrations/006_split_person_names');
const Coach = require('../../models/Coach');
const JudgeAccount = require('../../models/JudgeAccount');

/** A pre-split document: one `name`, written straight through the driver. */
async function legacy(model, name, email) {
  const doc = {
    name,
    email,
    password: '$2a$12$xkzf6jGVSx6.qXQ/GXY93OiYAmFAjB7Q9ph2ciDNL8cuW.PNc94Mi',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await model.collection.insertOne(doc);
  return doc;
}

describe('splitName', () => {
  it('splits on the first space', () => {
    expect(splitName('Anita Deshpande')).toEqual({ firstName: 'Anita', lastName: 'Deshpande' });
  });

  it('keeps every remaining word in the last name', () => {
    expect(splitName('Anita Rajeshwari Deshpande'))
      .toEqual({ firstName: 'Anita', lastName: 'Rajeshwari Deshpande' });
  });

  it('leaves a one-word name with an empty last name rather than inventing one', () => {
    expect(splitName('Anita')).toEqual({ firstName: 'Anita', lastName: '' });
  });

  it('tolerates ragged spacing', () => {
    expect(splitName('  Anita   Deshpande ')).toEqual({ firstName: 'Anita', lastName: 'Deshpande' });
  });
});

describe('006 — name split', () => {
  it('splits an existing coach and removes the old field', async () => {
    await legacy(Coach, 'Anita Deshpande', 'anita@club.in');

    await up();

    const coach = await Coach.collection.findOne({ email: 'anita@club.in' });
    expect(coach.firstName).toBe('Anita');
    expect(coach.lastName).toBe('Deshpande');
    expect(coach.name).toBeUndefined();
  });

  it('splits judge accounts too', async () => {
    await legacy(JudgeAccount, 'Pat Mhatre', 'pat@club.in');

    await up();

    const judge = await JudgeAccount.collection.findOne({ email: 'pat@club.in' });
    expect(judge.firstName).toBe('Pat');
    expect(judge.lastName).toBe('Mhatre');
  });

  it('leaves a migrated coach able to save again', async () => {
    // The reason `lastName` is not `required`: a one-word name migrates to an
    // empty last name, and a required String rejects ''. If that ever changes,
    // this coach can no longer edit their profile.
    await legacy(Coach, 'Anita', 'solo@club.in');

    await up();

    const coach = await Coach.findOne({ email: 'solo@club.in' });
    coach.phone = '9876543210';
    await expect(coach.save()).resolves.toBeTruthy();
  });

  it('skips a blank name instead of writing an empty first name', async () => {
    await legacy(Coach, '   ', 'blank@club.in');

    await up();

    const coach = await Coach.collection.findOne({ email: 'blank@club.in' });
    expect(coach.firstName).toBeUndefined();
    // Still there, so it is visible to whoever fixes it.
    expect(coach.name).toBe('   ');
  });

  it('is a no-op on a second run', async () => {
    await legacy(Coach, 'Anita Deshpande', 'anita@club.in');

    await up();
    await up();

    const coach = await Coach.collection.findOne({ email: 'anita@club.in' });
    expect(coach.firstName).toBe('Anita');
    expect(coach.lastName).toBe('Deshpande');
  });

  it('recombines on rollback', async () => {
    await legacy(Coach, 'Anita Deshpande', 'anita@club.in');

    await up();
    await down();

    const coach = await Coach.collection.findOne({ email: 'anita@club.in' });
    expect(coach.name).toBe('Anita Deshpande');
    expect(coach.firstName).toBeUndefined();
  });
});
