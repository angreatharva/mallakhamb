// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');
const JudgeAccount = require('../models/JudgeAccount');

/**
 * Register a roster of judges in one go.
 *
 * Judges normally create their own accounts at /judge/register — this is the
 * bulk equivalent for a panel of people who are all in the room, and it goes
 * through the same model, so the password is hashed by the same pre-save hook.
 *
 * Creating an account grants nothing on its own: an admin still has to seat
 * each judge on a panel before they can see or score anything.
 *
 *   node scripts/seedJudges.js                        # dry run: prints what it would do
 *   node scripts/seedJudges.js --commit               # actually writes
 *   node scripts/seedJudges.js --reset-passwords      # + reset existing roster judges
 *
 * Idempotent: a judge whose email already exists is reported and skipped, so
 * re-running after adding a name is safe. Ravi Gaikwad registered himself and
 * is deliberately absent from ROSTER; if he is ever added back, the skip picks
 * him up rather than creating a second account.
 *
 * `--reset-passwords` exists because an earlier version of this script issued
 * RANDOM passwords, printed once. Anyone seeded by it holds a credential
 * nobody has a record of, and no way to recover it either — the addresses are
 * derived rather than real, so password reset cannot reach them. The flag puts
 * the documented password back on accounts that are already there. It only
 * touches judges named in ROSTER: judges who registered themselves own their
 * own passwords and are never rewritten.
 */

/** Shared across the roster; individual rows may override any field. */
const DEFAULTS = {
  stateUnit: 'Maharashtra',
  certificationLevel: 'National',
};

/**
 * Only names live here. The email, phone and password are DERIVED below, so a
 * new judge is one line and there is no second place to make a typo.
 */
const ROSTER = [
  { firstName: 'Vinayak', lastName: 'Dhamne' },
  { firstName: 'Yatin', lastName: 'Nachre' },
  { firstName: 'Suraj', lastName: 'Turte' },
  { firstName: 'Mayur', lastName: 'Pashte' },
  { firstName: 'Preetesh', lastName: 'Gamre' },
  { firstName: 'Laxman', lastName: 'Sawant' },
];

/**
 * `firstname.<first letter of surname>@gmail.com`, matching the address Ravi
 * Gaikwad already registered with (ravi.g@gmail.com).
 *
 * THE EMAIL IS THE LOGIN and the only password-reset route. These are derived,
 * not confirmed — if a judge does not actually hold the address, they can sign
 * in with the password below but can never recover the account. Correct it from
 * /judge/profile (the judge can change their own) or fix it here before
 * committing.
 *
 * @param {{firstName: string, lastName: string}} judge
 * @returns {string}
 */
function emailFor({ firstName, lastName }) {
  return `${firstName.toLowerCase()}.${lastName[0].toLowerCase()}@gmail.com`;
}

/**
 * `Firstname@2026`.
 *
 * Deliberately predictable so the roster can be handed out verbally — which
 * also means anyone who knows a judge's name can derive their password. It is
 * a starting credential, not a secret: every judge should change it from
 * /judge/profile before they score anything that counts.
 *
 * Satisfies the server rule of 8+ characters with an upper, a lower and a
 * digit (validators/common.validator.js).
 *
 * @param {{firstName: string}} judge
 * @returns {string}
 */
function passwordFor({ firstName }) {
  const capitalised = firstName[0].toUpperCase() + firstName.slice(1).toLowerCase();
  return `${capitalised}@2026`;
}

/**
 * A plausible Indian mobile number: 10 digits, starting 6-9.
 *
 * Placeholders, and random per run — nobody supplied real numbers. Nothing in
 * the app sends to them today (phone is display-only), so a wrong number is
 * inert rather than dangerous, and each judge can correct their own from
 * /judge/profile.
 *
 * @returns {string}
 */
function randomIndianMobile() {
  const first = '6789'[crypto.randomInt(0, 4)];
  let rest = '';
  while (rest.length < 9) rest += crypto.randomInt(0, 10);
  return first + rest;
}

async function seedJudges() {
  const commit = process.argv.includes('--commit');
  const resetPasswords = process.argv.includes('--reset-passwords');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected${commit ? '' : ' — DRY RUN, nothing will be written'}\n`);

  const created = [];
  const skipped = [];
  const reset = [];

  for (const judge of ROSTER) {
    const email = emailFor(judge);
    const existing = await JudgeAccount.findOne({ email });

    if (existing) {
      if (!resetPasswords) {
        skipped.push({
          name: `${existing.firstName} ${existing.lastName}`,
          email,
          reason: 'already registered',
        });
        continue;
      }

      const password = passwordFor(judge);
      if (commit) {
        // Through the document, not updateOne: the pre-save hook is what
        // hashes it, and a raw update would store the plaintext.
        existing.password = password;
        await existing.save();
      }
      reset.push({ name: `${existing.firstName} ${existing.lastName}`, email, password });
      continue;
    }

    const password = passwordFor(judge);
    const phone = randomIndianMobile();

    if (commit) {
      await JudgeAccount.create({
        ...DEFAULTS,
        ...judge,
        email,
        phone,
        password,
        isActive: true,
      });
    }

    created.push({ name: `${judge.firstName} ${judge.lastName}`, email, phone, password });
  }

  if (skipped.length > 0) {
    console.log('Skipped (already registered):');
    console.table(skipped);
    console.log('Pass --reset-passwords to put the documented password back on these.\n');
  }

  if (reset.length > 0) {
    console.log(commit ? 'Password reset:' : 'Would reset the password of:');
    console.table(reset);
  }

  if (created.length > 0) {
    console.log(commit ? 'Created:' : 'Would create:');
    console.table(created);
    if (commit) {
      console.log('Passwords follow the Firstname@2026 pattern, so anyone who knows a');
      console.log('judge\'s name can work theirs out. Ask each of them to change it from');
      console.log('/judge/profile.\n');
    }
  } else {
    console.log('Nothing to create — every judge on the roster is already registered.\n');
  }

  console.log(
    `${created.length} to create, ${reset.length} to reset, ${skipped.length} skipped.`
  );
  if (!commit && (created.length > 0 || reset.length > 0)) {
    console.log('Re-run with --commit to write them.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seedJudges().catch(async (error) => {
  console.error('❌ Seeding failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
