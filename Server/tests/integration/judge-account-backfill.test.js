/**
 * Migration 006 — legacy judges become accounts.
 *
 * This runs against real Mongoose models on the in-memory server, because the
 * things that can go wrong here are storage-level: re-hashing a hash (which
 * would lock every migrated judge out permanently), missing the second seat of
 * a judge who works two categories, or minting one account per seat instead of
 * one per person.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { up, down, placeholderEmail } = require('../../src/migrations/006_judge_accounts_backfill');
const Judge = require('../../models/Judge');
const JudgeAccount = require('../../models/JudgeAccount');

const competitionA = new mongoose.Types.ObjectId();
const competitionB = new mongoose.Types.ObjectId();

/** A pre-split judge row: the seat and the login in one document. */
async function legacySeat({
  competition = competitionA,
  username,
  name,
  passwordHash,
  gender = 'Male',
  ageGroup = 'Under14',
  judgeNo,
  judgeType,
}) {
  // Written through the driver so the pre-save hook does not re-hash a hash —
  // the same reason the migration itself uses the driver.
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    competition,
    competitionTypes: ['competition_1'],
    gender,
    ageGroup,
    judgeNo,
    judgeType,
    name,
    username,
    password: passwordHash,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await Judge.collection.insertOne(doc);
  return doc;
}

describe('006 — judge account backfill', () => {
  let hash;

  beforeEach(async () => {
    hash = await bcrypt.hash('JudgeSecret1', 4);
  });

  it('creates one account per person per meet, not one per seat', async () => {
    // One judge, two categories at the same meet: two rows, one person.
    await legacySeat({ username: 'j1-m-u14-1', name: 'Pat Mhatre', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });
    await legacySeat({ username: 'j1-m-u14-1', name: 'Pat Mhatre', passwordHash: hash, judgeNo: 3, judgeType: 'Judge 2', ageGroup: 'Under16' });

    await up();

    const accounts = await JudgeAccount.find({});
    expect(accounts).toHaveLength(1);

    const seats = await Judge.find({ judgeAccount: accounts[0]._id });
    expect(seats).toHaveLength(2);
  });

  it('keeps the migrated judge password usable', async () => {
    await legacySeat({ username: 'sr-m-u14-1', name: 'Sam', passwordHash: hash, judgeNo: 1, judgeType: 'Senior Judge' });

    await up();

    const account = await JudgeAccount.findOne({}).select('+password');
    // The hash must be copied, not re-hashed: bcrypt over a bcrypt hash
    // produces a value the original password no longer matches.
    expect(await bcrypt.compare('JudgeSecret1', account.password)).toBe(true);
  });

  it('keeps two meets that generated the same username apart', async () => {
    // The exact collision the old slot-derived usernames produced: the same
    // string for two different people at two different meets.
    await legacySeat({ competition: competitionA, username: 'j1-m-u14-1', name: 'Pat', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });
    await legacySeat({ competition: competitionB, username: 'j1-m-u14-1', name: 'Sam', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });

    await up();

    const accounts = await JudgeAccount.find({}).sort({ name: 1 });
    expect(accounts.map((a) => a.name)).toEqual(['Pat', 'Sam']);
    expect(new Set(accounts.map((a) => a.email)).size).toBe(2);
  });

  it('flags every migrated address as a placeholder', async () => {
    await legacySeat({ username: 'j1-m-u14-1', name: 'Pat', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });

    await up();

    const account = await JudgeAccount.findOne({});
    // Nobody can sign in as this judge until an admin replaces the address —
    // which is why the flag exists and why the admin screen surfaces it.
    expect(account.isPlaceholderEmail).toBe(true);
    expect(account.email).toBe(placeholderEmail('j1-m-u14-1', competitionA));
    expect(account.email).toMatch(/@judges\.invalid$/);
  });

  it('leaves empty slots alone', async () => {
    await legacySeat({ username: '', name: '', passwordHash: '', judgeNo: 5, judgeType: 'Judge 4' });

    await up();

    expect(await JudgeAccount.countDocuments()).toBe(0);
    expect(await Judge.countDocuments({ judgeAccount: { $ne: null } })).toBe(0);
  });

  it('can be run twice without duplicating anything', async () => {
    await legacySeat({ username: 'j1-m-u14-1', name: 'Pat', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });

    await up();
    await up();

    expect(await JudgeAccount.countDocuments()).toBe(1);
  });

  it('rolls back the accounts it created', async () => {
    await legacySeat({ username: 'j1-m-u14-1', name: 'Pat', passwordHash: hash, judgeNo: 2, judgeType: 'Judge 1' });

    await up();
    await down();

    expect(await JudgeAccount.countDocuments()).toBe(0);
    expect(await Judge.countDocuments({ judgeAccount: { $ne: null } })).toBe(0);
  });
});
