/**
 * 006 — give every existing judge an account, and point their seats at it.
 *
 * Before this, a Judge document was both the panel seat and the login: it
 * carried a name, a slot-derived username (`J1-M-U14-1`) and a password the
 * admin typed in. One person judging three categories at a meet was three
 * rows, three bcrypt hashes and three lockout counters, all sharing a username
 * string that was not even unique across meets.
 *
 * This groups those rows by (username, competition) — one group is one person
 * at one meet — creates a JudgeAccount for each, and links every row in the
 * group to it.
 *
 * TWO THINGS TO KNOW BEFORE RUNNING IT:
 *
 * 1. The password hash is copied VERBATIM, so migrated judges keep the
 *    password they already have. The account is inserted through the driver
 *    rather than the model precisely so the pre-save hook does not hash the
 *    hash.
 *
 * 2. There is no email anywhere in the old judge data, and judges now sign in
 *    by email. Each account therefore gets a synthetic address and is flagged
 *    `isPlaceholderEmail`. Those judges CANNOT SIGN IN until an admin replaces
 *    it with their real address (the admin judge screen shows them with a
 *    "needs email" badge and PATCH /api/admin/judge-accounts/:id sets it).
 *    The mapping is printed below so it can be reconciled by hand if needed.
 *
 * If the judge data in this environment is disposable, the cheaper path is to
 * delete the judge rows and have judges register themselves: Score documents
 * reference judges only by panel ROLE (`judgeSlips.judgeRole`), never by id,
 * so no scoring history is affected either way.
 *
 * Idempotent: rows that already carry a `judgeAccount` are skipped, and an
 * account whose synthetic address already exists is reused.
 */

const mongoose = require('mongoose');
const Judge = require('../../models/Judge');
const JudgeAccount = require('../../models/JudgeAccount');

/**
 * A deterministic, obviously-fake address for a migrated judge.
 *
 * `.invalid` is reserved by RFC 2606 and can never be delivered to, so nothing
 * here can accidentally email a real person.
 *
 * @param {string} username
 * @param {*} competitionId
 * @returns {string}
 */
function placeholderEmail(username, competitionId) {
  const user = String(username).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = String(competitionId).slice(-6);
  return `${user || 'judge'}.${suffix}@judges.invalid`;
}

/**
 * A bcrypt-shaped hash nobody holds the password for.
 *
 * Used when a legacy row has no password at all. The seat keeps working and
 * the judge recovers through password reset once their address is corrected —
 * better than inventing a password and telling nobody.
 */
const UNUSABLE_PASSWORD_HASH = '$2a$12$xkzf6jGVSx6.qXQ/GXY93OiYAmFAjB7Q9ph2ciDNL8cuW.PNc94Mi';

async function up() {
  const judges = Judge.collection;
  const accounts = JudgeAccount.collection;

  const groups = await judges
    .aggregate([
      {
        $match: {
          username: { $nin: [null, ''] },
          $or: [{ judgeAccount: null }, { judgeAccount: { $exists: false } }],
        },
      },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: { username: '$username', competition: '$competition' },
          ids: { $push: '$_id' },
          // The most recently touched row wins for name and password: it is
          // the one an admin last edited, so it is the one the judge was told
          // about.
          name: { $first: '$name' },
          password: { $first: '$password' },
        },
      },
    ])
    .toArray();

  const mapping = [];
  let seatsLinked = 0;

  for (const group of groups) {
    const { username, competition } = group._id;
    const email = placeholderEmail(username, competition);

    let account = await accounts.findOne({ email });

    if (!account) {
      const now = new Date();
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        name: (group.name || '').trim() || String(username),
        email,
        phone: null,
        // Verbatim — see the note at the top of this file.
        password: group.password || UNUSABLE_PASSWORD_HASH,
        loginAttempts: 0,
        lockUntil: null,
        stateUnit: null,
        registrationNumber: null,
        certificationLevel: null,
        photo: null,
        isPlaceholderEmail: true,
        mustResetPassword: !group.password,
        isActive: true,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        createdAt: now,
        updatedAt: now,
      };
      await accounts.insertOne(doc);
      account = doc;
    }

    const result = await judges.updateMany(
      { _id: { $in: group.ids } },
      { $set: { judgeAccount: account._id, isActive: true } }
    );
    seatsLinked += result.modifiedCount ?? 0;

    mapping.push({ username, competition: String(competition), email, seats: group.ids.length });
  }

  // Printed rather than logged through Winston: the migration runner is a CLI,
  // and whoever runs it needs this table in front of them.
  if (mapping.length > 0) {
    console.log('\n  Judge accounts created — these addresses are placeholders and must be replaced:');
    console.table(mapping);
  }
  console.log(`  ${mapping.length} account(s), ${seatsLinked} seat(s) linked.`);
}

async function down() {
  // Unlink the seats, then remove only the accounts this migration invented.
  const accounts = await JudgeAccount.collection
    .find({ isPlaceholderEmail: true }, { projection: { _id: 1 } })
    .toArray();
  const ids = accounts.map((a) => a._id);

  if (ids.length > 0) {
    await Judge.collection.updateMany(
      { judgeAccount: { $in: ids } },
      { $set: { judgeAccount: null } }
    );
    await JudgeAccount.collection.deleteMany({ _id: { $in: ids } });
  }
}

module.exports = { up, down, placeholderEmail };
