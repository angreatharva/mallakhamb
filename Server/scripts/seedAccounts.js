// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const Player = require('../models/Player');
const Coach = require('../models/Coach');
const JudgeAccount = require('../models/JudgeAccount');

/**
 * Create player, coach and judge accounts from what the REGISTRATION FORMS
 * actually sent.
 *
 * This script does not describe what an account is made of — it replays a
 * recording. `Web/e2e/register-*.spec.js` drives the real UI and writes every
 * successful registration's request body to `seed/registrations.generated.json`;
 * this reads that file and writes the same accounts straight to MongoDB.
 *
 * That indirection is the point. A seeder that restates the fields by hand
 * drifts the moment a form changes, silently, and you find out when a seeded
 * account behaves differently from a real one. The judge seeder this replaces
 * did exactly that twice: it kept writing the pre-account judge shape after
 * that shape was gone, and it invented random passwords the UI never issues.
 *
 *   1. npm --prefix Web run seed:ui        # register through the UI, capture
 *   2. npm --prefix Server run seed        # dry run: what would be written
 *   3. npm --prefix Server run seed -- --commit
 *
 * Use it when you want the accounts without waiting for a browser — restoring a
 * wiped dev database, or setting up a second machine from a capture someone
 * else made.
 *
 * Options:
 *   --commit          actually write (default is a dry run)
 *   --role=player     only that role; repeatable, e.g. --role=coach --role=judge
 *   --file=<path>     read a different capture
 *
 * Idempotent: an account whose email already exists is reported and skipped.
 */

const DEFAULT_CAPTURE = path.join(__dirname, 'seed', 'registrations.generated.json');

/**
 * Which model owns each role, and which fields the model does not take.
 *
 * `confirmPassword` exists only so the form can compare two boxes; it is never
 * part of an account. Everything else the form sends is passed through
 * untouched — including fields added to the form after this file was written,
 * which is the whole reason the payload is replayed rather than re-specified.
 */
const ROLES = {
  player: { model: Player, label: 'Player' },
  coach: { model: Coach, label: 'Coach' },
  judge: { model: JudgeAccount, label: 'Judge' },
};

const UI_ONLY_FIELDS = ['confirmPassword'];

/** @param {string[]} argv @returns {{commit: boolean, roles: string[], file: string}} */
function parseArgs(argv) {
  const roles = argv
    .filter((a) => a.startsWith('--role='))
    .map((a) => a.slice('--role='.length).toLowerCase());

  const fileArg = argv.find((a) => a.startsWith('--file='));

  for (const role of roles) {
    if (!ROLES[role]) {
      throw new Error(`Unknown --role="${role}". Known roles: ${Object.keys(ROLES).join(', ')}`);
    }
  }

  return {
    commit: argv.includes('--commit'),
    roles: roles.length > 0 ? roles : Object.keys(ROLES),
    file: fileArg ? path.resolve(fileArg.slice('--file='.length)) : DEFAULT_CAPTURE,
  };
}

/**
 * Strip the fields that belong to the form rather than the account.
 * @param {Object} payload
 * @returns {Object}
 */
function toAccount(payload) {
  const account = { ...payload };
  for (const field of UI_ONLY_FIELDS) delete account[field];
  account.email = String(account.email || '').toLowerCase().trim();
  return account;
}

async function seedAccounts() {
  const { commit, roles, file } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`❌ No capture at ${file}`);
    console.error('   Register through the UI first — that run is what produces it:');
    console.error('     npm --prefix Web run seed:ui');
    console.error('   (or point at an existing capture with --file=<path>)');
    process.exit(1);
  }

  const capture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const registrations = (capture.registrations || []).filter((r) => roles.includes(r.role));

  if (registrations.length === 0) {
    console.error(`❌ ${file} holds nothing for: ${roles.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 ${path.basename(file)} — captured ${capture.capturedAt || 'at an unknown time'}`);
  console.log(`   ${registrations.length} registration(s) for: ${roles.join(', ')}\n`);

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected${commit ? '' : ' — DRY RUN, nothing will be written'}\n`);

  const created = [];
  const skipped = [];
  const failed = [];

  for (const { role, payload } of registrations) {
    const { model, label } = ROLES[role];
    const account = toAccount(payload);

    try {
      if (await model.findOne({ email: account.email })) {
        skipped.push({ role: label, email: account.email, reason: 'already registered' });
        continue;
      }

      if (commit) {
        // Through the model, so the same pre-save hook that hashes a password
        // during real registration hashes this one.
        await model.create({ ...account, isActive: true });
      }

      created.push({
        role: label,
        name: `${account.firstName} ${account.lastName}`.trim(),
        email: account.email,
        password: account.password,
      });
    } catch (error) {
      failed.push({ role: label, email: account.email, error: error.message });
    }
  }

  if (skipped.length > 0) {
    console.log('Skipped (already registered):');
    console.table(skipped);
  }

  if (created.length > 0) {
    console.log(commit ? 'Created:' : 'Would create:');
    console.table(created);
  }

  if (failed.length > 0) {
    console.log('Failed:');
    console.table(failed);
  }

  console.log(
    `${created.length} ${commit ? 'created' : 'to create'}, ` +
    `${skipped.length} skipped, ${failed.length} failed.`
  );
  if (!commit && created.length > 0) {
    console.log('Re-run with --commit to write them.');
  }

  await mongoose.disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

seedAccounts().catch(async (error) => {
  console.error('❌ Seeding failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
