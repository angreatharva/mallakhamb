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
 * THE EMAIL IS THE LOGIN and the only password-reset route, so it has to be the
 * judge's own. The roster below follows the convention already in use
 * (`ravi.g@gmail.com`): first name, dot, first letter of the surname. The phone
 * numbers are placeholders. Correct either from /judge/profile — the judge can
 * change their own — or by editing this file and re-running, which skips anyone
 * already registered.
 *
 *   node scripts/seedJudges.js              # dry run: prints what it would do
 *   node scripts/seedJudges.js --commit     # actually writes
 *
 * Idempotent: a judge whose email already exists is reported and skipped, so
 * re-running after fixing one row is safe.
 */

/** Shared across the roster; individual rows may override any field. */
const DEFAULTS = {
  stateUnit: 'Maharashtra',
  certificationLevel: 'National',
};

const PLACEHOLDER = 'REPLACE_ME';

const ROSTER = [
  { firstName: 'Vinayak', lastName: 'Dhamne', email: 'vinayak.d@gmail.com', phone: '9820714503' },
  { firstName: 'Yatin', lastName: 'Nachre', email: 'yatin.n@gmail.com', phone: '9821336074' },
  { firstName: 'Mayur', lastName: 'Pashte', email: 'mayur.p@gmail.com', phone: '9769428135' },
  { firstName: 'Suraj', lastName: 'Turte', email: 'suraj.t@gmail.com', phone: '9702581649' },
  { firstName: 'Rajesh', lastName: 'Amrale', email: 'rajesh.a@gmail.com', phone: '9833065927' },
  { firstName: 'Preetesh', lastName: 'Gamre', email: 'preetesh.g@gmail.com', phone: '9930147286' },
  { firstName: 'Laxman', lastName: 'Sawant', email: 'laxman.s@gmail.com', phone: '9892473610' },
];

/**
 * A password the judge is expected to change.
 *
 * Random per account rather than one shared string: a roster that all opens
 * with the same password is one leaked note away from anyone scoring as
 * anyone. Satisfies the server rule of 8+ chars with upper, lower and a digit.
 */
function temporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(0, set.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 10) chars.push(pick(all));

  // Shuffle so the guaranteed characters are not always in the same position.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function seedJudges() {
  const commit = process.argv.includes('--commit');
  const allowPlaceholders = process.argv.includes('--allow-placeholders');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  const unfilled = ROSTER.filter((j) => j.email === PLACEHOLDER || j.phone === PLACEHOLDER);
  if (unfilled.length > 0 && !allowPlaceholders) {
    console.error(`❌ ${unfilled.length} judge(s) still have a ${PLACEHOLDER} email or phone.`);
    console.error('   Edit ROSTER in this file with their real details first.');
    console.error('   An address is the login AND the only password-reset route, so a');
    console.error('   made-up one leaves that judge unable to recover their account.');
    console.error('   (Override with --allow-placeholders if you know what you are doing.)');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected${commit ? '' : ' — DRY RUN, nothing will be written'}\n`);

  const created = [];
  const skipped = [];

  for (const judge of ROSTER) {
    const email = String(judge.email).toLowerCase().trim();
    const existing = await JudgeAccount.findOne({ email });

    if (existing) {
      skipped.push({ name: `${existing.firstName} ${existing.lastName}`, email, reason: 'already registered' });
      continue;
    }

    const password = temporaryPassword();

    if (commit) {
      await JudgeAccount.create({
        ...DEFAULTS,
        ...judge,
        email,
        password,
        isActive: true,
      });
    }

    created.push({ name: `${judge.firstName} ${judge.lastName}`, email, password });
  }

  if (skipped.length > 0) {
    console.log('Skipped (already registered):');
    console.table(skipped);
  }

  if (created.length > 0) {
    console.log(commit ? 'Created — give each judge their password, once:' : 'Would create:');
    console.table(created);
    if (commit) {
      console.log('These passwords are not stored anywhere in readable form and cannot be');
      console.log('printed again. Ask each judge to change theirs from /judge/profile.\n');
    }
  } else {
    console.log('Nothing to create — every judge on the roster is already registered.\n');
  }

  console.log(`${created.length} to create, ${skipped.length} skipped.`);
  if (!commit && created.length > 0) {
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
