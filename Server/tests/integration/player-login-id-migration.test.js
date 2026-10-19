/**
 * Migration 012 on a database shaped like production before it: players with
 * no `loginId` or `emailType`, and the old whole-collection unique `email_1`.
 */

const mongoose = require('mongoose');
const Player = require('../../src/models/Player');
const migration = require('../../src/migrations/012_player_login_ids');

const legacy = (firstName, email, createdAt) => ({
  firstName,
  lastName: 'Sharma',
  email,
  dateOfBirth: new Date('2016-06-15'),
  gender: 'Male',
  password: 'hash',
  createdAt,
});

async function legacyDatabase() {
  const players = mongoose.connection.collection('players');
  await players.drop().catch(() => {});
  await players.createIndex({ email: 1 }, { unique: true });
  // Inserted out of order, to prove the oldest account keeps the plain ID.
  await players.insertMany([
    legacy('Rahul', 'second@example.com', new Date('2024-02-01')),
    legacy('Rahul', 'first@example.com', new Date('2024-01-01')),
    { ...legacy('Undated', 'nodob@example.com', new Date('2024-03-01')), dateOfBirth: null },
  ]);
  return players;
}

describe('012_player_login_ids', () => {
  test('gives every dated player an ID, oldest first, and marks them self', async () => {
    const players = await legacyDatabase();
    await migration.up();

    const byEmail = Object.fromEntries((await players.find().toArray()).map((p) => [p.email, p]));
    expect(byEmail['first@example.com'].loginId).toBe('rahul.sharma.150616');
    expect(byEmail['second@example.com'].loginId).toBe('rahul.sharma.150616.2');
    expect(byEmail['nodob@example.com'].loginId).toBeUndefined();
    expect(Object.values(byEmail).every((p) => p.emailType === 'self')).toBe(true);
  });

  test('swaps the old unique email index for the own-address one', async () => {
    const players = await legacyDatabase();
    await migration.up();

    const indexes = await players.indexes();
    expect(indexes.some((i) => JSON.stringify(i.key) === '{"email":1}' && i.unique && !i.partialFilterExpression)).toBe(false);
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining([Player.PLAYER_SELF_EMAIL_INDEX, Player.PLAYER_LOGIN_ID_INDEX]));

    // Which is the point: siblings can now share a guardian's address.
    await players.insertMany([
      { ...legacy('Diya', 'parent@example.com'), emailType: 'guardian' },
      { ...legacy('Isha', 'parent@example.com'), emailType: 'guardian' },
    ]);
    await expect(players.insertOne({ ...legacy('Copy', 'first@example.com'), emailType: 'self' })).rejects.toThrow(/duplicate key/);
  });

  test('is safe to run twice', async () => {
    const players = await legacyDatabase();
    await migration.up();
    await migration.up();
    const ids = (await players.find({ loginId: { $type: 'string' } }).toArray()).map((p) => p.loginId).sort();
    expect(ids).toEqual(['rahul.sharma.150616', 'rahul.sharma.150616.2']);
  });

  test('down refuses while siblings share an address', async () => {
    const players = await legacyDatabase();
    await migration.up();
    await players.insertMany([
      { ...legacy('Diya', 'parent@example.com'), emailType: 'guardian' },
      { ...legacy('Isha', 'parent@example.com'), emailType: 'guardian' },
    ]);
    await expect(migration.down()).rejects.toThrow(/shared by several players/);
  });
});
