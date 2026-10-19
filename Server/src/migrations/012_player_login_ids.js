/**
 * 012 — Player IDs, and email unique only as a player's own address.
 *
 * Players without an email of their own now register with a guardian's
 * address (shared by siblings) or with none, and sign in with a Player ID —
 * `firstname.lastname.ddmmyy`, `.2`/`.3` for a duplicate (see
 * utils/data/player-login-id.util).
 *
 * 1. Every existing player is marked `emailType: 'self'` — they all registered
 *    with their own address, the only kind there was.
 * 2. Every existing player gets a Player ID, oldest account first, so where two
 *    people share a name and birthday the one who registered first keeps the
 *    plain ID.
 * 3. The old `email_1` unique index is dropped and replaced by one that is
 *    unique over `self` addresses only. The index manager cannot do this: it
 *    sees the same key with different options, reports a conflict and leaves
 *    the old index alone, which would keep refusing a second sibling.
 *
 * Steps 1 and 2 only fill fields that are missing, so a re-run is harmless.
 */

const Player = require('../models/Player');
const { baseLoginId, nextFreeLoginId } = require('../utils/data/player-login-id.util');

const { PLAYER_LOGIN_ID_INDEX, PLAYER_SELF_EMAIL_INDEX } = Player;
const sameKey = (index, key) => JSON.stringify(index.key) === JSON.stringify(key);

async function up() {
  const players = Player.collection;

  await players.updateMany(
    { $or: [{ emailType: { $exists: false } }, { emailType: null }] },
    { $set: { emailType: 'self' } }
  );

  // Every ID already issued, so the backfill never hands out a taken one.
  const taken = new Set(
    (await players.find({ loginId: { $type: 'string' } }, { projection: { loginId: 1 } }).toArray())
      .map((p) => p.loginId)
  );

  const missing = players
    .find({ $or: [{ loginId: { $exists: false } }, { loginId: null }] },
      { projection: { firstName: 1, lastName: 1, dateOfBirth: 1 } })
    .sort({ createdAt: 1, _id: 1 });

  const writes = [];
  for await (const player of missing) {
    const base = baseLoginId(player.firstName, player.lastName, player.dateOfBirth);
    if (!base) continue; // no usable date of birth; the model assigns one on its next save
    const loginId = nextFreeLoginId(base, taken);
    taken.add(loginId);
    writes.push({ updateOne: { filter: { _id: player._id }, update: { $set: { loginId } } } });
  }
  if (writes.length) await players.bulkWrite(writes, { ordered: true });

  // Drop the old whole-collection unique email index, under whatever name.
  const existing = await players.indexes();
  for (const index of existing) {
    if (sameKey(index, { email: 1 }) && index.unique && !index.partialFilterExpression) {
      await players.dropIndex(index.name);
    }
  }

  await players.createIndex(
    { loginId: 1 },
    { unique: true, partialFilterExpression: { loginId: { $type: 'string' } }, name: PLAYER_LOGIN_ID_INDEX }
  );
  if (!existing.some((index) => index.name === PLAYER_SELF_EMAIL_INDEX)) {
    await players.createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { emailType: 'self', email: { $type: 'string' } }, name: PLAYER_SELF_EMAIL_INDEX }
    );
  }
  await players.createIndex({ email: 1, emailType: 1 });
}

/**
 * Put back the whole-collection unique email index. Refuses while two players
 * share an address — that is a guardian's email used for siblings, and the old
 * index cannot hold it. The Player IDs stay: nothing reads them once the
 * code is rolled back, and they cost nothing.
 */
async function down() {
  const players = Player.collection;
  const shared = await players.aggregate([
    { $match: { email: { $type: 'string' } } },
    { $group: { _id: '$email', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]).toArray();
  if (shared.length) {
    throw new Error(
      `Cannot restore the unique email index: ${shared.length}+ address(es) are shared by several players `
      + `(e.g. ${shared.map((s) => s._id).join(', ')}). Give each player their own address first.`
    );
  }
  await players.dropIndex(PLAYER_SELF_EMAIL_INDEX).catch(() => {});
  await players.dropIndex(PLAYER_LOGIN_ID_INDEX).catch(() => {});
  await players.createIndex({ email: 1 }, { unique: true });
}

module.exports = { up, down };
