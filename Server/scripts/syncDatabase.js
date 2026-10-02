/**
 * Copy a whole database — documents AND indexes — between two of yours.
 *
 *   node scripts/syncDatabase.js --from=prod --to=dev            # dry run
 *   node scripts/syncDatabase.js --from=prod --to=dev --commit
 *   node scripts/syncDatabase.js --from=dev  --to=prod --commit  # asks twice
 *   node scripts/syncDatabase.js --from=prod --to=dev --only=competitions,teams
 *   node scripts/syncDatabase.js --from=mumbai-dev  --to=dev  --commit
 *   node scripts/syncDatabase.js --from=mumbai-prod --to=prod --commit  # asks twice
 *
 * `prod` and `dev` are read from MONGODB_URI in `.env.production` and `.env`,
 * so the two ends are the ones already configured rather than pasted on a
 * command line where a typo points at the wrong cluster.
 *
 * `mumbai-dev` and `mumbai-prod` are the original Mumbai cluster, which the
 * app left for Singapore. They come from DEV_MONGODB_URI and PROD_MONGODB_URI
 * in `.env.mumbai` (gitignored), kept so the two clusters can be synced while
 * both are alive.
 *
 * WHAT IT DOES
 *
 * Per collection: drops the destination collection, copies every document in
 * batches, then rebuilds the source's indexes on the destination. Indexes are
 * copied because they are half of what makes a database usable — a dev copy
 * with the documents and none of the indexes behaves nothing like the original
 * under any query worth testing.
 *
 * WHAT IT WILL NOT DO
 *
 *   - run without --commit (dry run first, always)
 *   - write to the SAME database it is reading from
 *   - write to `prod` without two confirmations, one of them typed
 *
 * The asymmetry is deliberate. dev -> prod is the direction that destroys other
 * people's work, and it is the direction someone reaches for when they have got
 * the flags the wrong way round.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const mongoose = require('mongoose');

const SERVER_DIR = path.join(__dirname, '..');

/** Documents per insertMany. Keeps the BSON payload under the 16MB command cap. */
const BATCH = 500;

/**
 * Read one variable out of an env file without loading it into the process —
 * `.env` is already loaded, and loading a second one would overwrite it.
 *
 * @param {string} file
 * @param {string} key
 * @returns {string|null}
 */
function uriFrom(file, key) {
  const full = path.join(SERVER_DIR, file);
  if (!fs.existsSync(full)) return null;
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(fs.readFileSync(full, 'utf8'));
  return match ? match[1].trim().replace(/^"(.*)"$/, '$1') : null;
}

/** `prod: true` ends cost a second, typed confirmation to write to. */
const ENDS = {
  dev: { file: '.env', key: 'MONGODB_URI', prod: false },
  prod: { file: '.env.production', key: 'MONGODB_URI', prod: true },
  'mumbai-dev': { file: '.env.mumbai', key: 'DEV_MONGODB_URI', prod: false },
  'mumbai-prod': { file: '.env.mumbai', key: 'PROD_MONGODB_URI', prod: true },
};

const maskUri = (uri) => String(uri).replace(/\/\/[^@]*@/, '//***@');
/** Path segment after the host; '' when the URI names no database. */
const dbNameOf = (uri) => {
  const afterScheme = String(uri).replace(/^[a-z+]+:\/\//i, '');
  const slash = afterScheme.indexOf('/');
  return slash === -1 ? '' : afterScheme.slice(slash + 1).split('?')[0];
};
/** Cluster host(s) + database — what actually identifies a database. */
const targetOf = (uri) => {
  const afterScheme = String(uri).replace(/^[a-z+]+:\/\//i, '').replace(/^[^@]*@/, '');
  return `${afterScheme.split(/[/?]/)[0].toLowerCase()}/${dbNameOf(uri)}`;
};

/** @param {string} question @returns {Promise<string>} */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    from: flag('from'),
    to: flag('to'),
    only: flag('only') ? flag('only').split(',').map((s) => s.trim()).filter(Boolean) : null,
    commit: argv.includes('--commit'),
    yes: argv.includes('--yes'),
  };
}

/**
 * Copy one collection's documents and indexes.
 *
 * @param {import('mongoose').Connection} source
 * @param {import('mongoose').Connection} destination
 * @param {string} name
 * @param {boolean} commit
 */
async function copyCollection(source, destination, name, commit) {
  const from = source.collection(name);
  const to = destination.collection(name);

  const count = await from.countDocuments();
  const indexes = (await from.indexes()).filter((index) => index.name !== '_id_');

  if (!commit) {
    return { name, documents: count, indexes: indexes.length, copied: 0 };
  }

  // Drop rather than upsert: a partial overwrite leaves the destination as a mix
  // of two databases, which is harder to reason about than either.
  await to.drop().catch((error) => {
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
  });

  let copied = 0;
  const cursor = from.find({});
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await to.insertMany(batch, { ordered: false });
    copied += batch.length;
    batch = [];
    process.stderr.write(`\r    ${name}: ${copied}/${count}`);
  };

  for await (const document of cursor) {
    batch.push(document);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  if (count > 0) process.stderr.write('\n');

  for (const index of indexes) {
    const { key, name: indexName, v, ns, background, ...options } = index;
    // `v` and `ns` are server-assigned metadata, not options; passing them back
    // is rejected.
    await to.createIndex(key, { name: indexName, ...options }).catch((error) => {
      process.stderr.write(`    ! ${name}.${indexName}: ${error.message}\n`);
    });
  }

  return { name, documents: count, indexes: indexes.length, copied };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!ENDS[args.from] || !ENDS[args.to]) {
    console.error(`Usage: --from=<${Object.keys(ENDS).join('|')}> --to=<same> [--only=a,b] [--commit]`);
    process.exit(1);
  }
  if (args.from === args.to) {
    console.error('--from and --to are the same end.');
    process.exit(1);
  }

  const sourceUri = uriFrom(ENDS[args.from].file, ENDS[args.from].key);
  const destinationUri = uriFrom(ENDS[args.to].file, ENDS[args.to].key);

  for (const [end, uri] of [[args.from, sourceUri], [args.to, destinationUri]]) {
    if (!uri) {
      console.error(`No ${ENDS[end].key} in ${ENDS[end].file} — cannot resolve "${end}".`);
      process.exit(1);
    }
    /*
     * A URI with no database path connects to `test`. Copying from it reads
     * nothing; copying to it fills a database the app never opens.
     */
    if (!dbNameOf(uri)) {
      console.error(`${ENDS[end].key} in ${ENDS[end].file} names no database `
        + `(${maskUri(uri)}). Add one, e.g. ".../BRMC_dev".`);
      process.exit(1);
    }
  }

  /*
   * The guard that matters. `.env` and `.env.production` pointed at the SAME
   * database until recently, and with both ends resolving to one place this
   * would drop a collection and copy it onto itself — reading from a cursor
   * whose collection had just been dropped.
   *
   * Cluster AND name: BRMC_dev on Mumbai and BRMC_dev on Singapore are two
   * databases, and copying between them is the point of the mumbai-* ends.
   */
  if (sourceUri === destinationUri || targetOf(sourceUri) === targetOf(destinationUri)) {
    console.error('Both ends resolve to the same database:');
    console.error(`  ${ENDS[args.from].file}: ${maskUri(sourceUri)}`);
    console.error(`  ${ENDS[args.to].file}: ${maskUri(destinationUri)}`);
    console.error('\nPoint them at different databases before syncing.');
    process.exit(1);
  }

  console.log(`\n  from  ${args.from.padEnd(5)} ${maskUri(sourceUri)}`);
  console.log(`  to    ${args.to.padEnd(5)} ${maskUri(destinationUri)}`);
  console.log(`  mode  ${args.commit ? 'COMMIT — the destination will be overwritten' : 'dry run'}\n`);

  const source = await mongoose.createConnection(sourceUri).asPromise();
  const destination = await mongoose.createConnection(destinationUri).asPromise();

  const all = (await source.db.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  const collections = args.only ? all.filter((name) => args.only.includes(name)) : all;

  if (args.only) {
    const missing = args.only.filter((name) => !all.includes(name));
    if (missing.length) console.log(`  (not in source, skipped: ${missing.join(', ')})\n`);
  }

  if (collections.length === 0) {
    console.log('  Nothing to copy.');
    await source.close(); await destination.close();
    return;
  }

  if (args.commit) {
    console.log(`  This DROPS and replaces ${collections.length} collection(s) in `
      + `"${dbNameOf(destinationUri)}".`);

    if (!args.yes) {
      const first = await ask('  Continue? (yes/no) ');
      if (first !== 'yes') { console.log('  Cancelled.'); await source.close(); await destination.close(); return; }

      // Writing toward prod is the direction that destroys other people's work,
      // so it costs a second, typed confirmation.
      if (ENDS[args.to].prod) {
        const name = dbNameOf(destinationUri);
        const typed = await ask(`  Destination is PROD. Type the database name ("${name}") to confirm: `);
        if (typed !== name) { console.log('  Cancelled.'); await source.close(); await destination.close(); return; }
      }
    }
    console.log('');
  }

  const results = [];
  for (const name of collections) {
    results.push(await copyCollection(source, destination, name, args.commit));
  }

  console.log(`\n  ${'collection'.padEnd(26)}${'docs'.padStart(9)}${'indexes'.padStart(9)}`);
  console.log(`  ${'-'.repeat(44)}`);
  for (const row of results) {
    console.log(`  ${row.name.padEnd(26)}${String(row.documents).padStart(9)}${String(row.indexes).padStart(9)}`);
  }

  const totalDocs = results.reduce((sum, r) => sum + r.documents, 0);
  console.log(`  ${'-'.repeat(44)}`);
  console.log(`  ${String(results.length).padStart(2)} collection(s), ${totalDocs} document(s)`);

  if (!args.commit) {
    console.log('\n  Dry run — nothing was written. Add --commit to do it.');
  } else {
    console.log('\n  Done. Run `npm run start:check` against the destination to confirm '
      + 'migrations and indexes line up.');
  }

  await source.close();
  await destination.close();
}

main().catch(async (error) => {
  console.error(`\nSync failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
