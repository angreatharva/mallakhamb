#!/usr/bin/env node
'use strict';

/**
 * Record a corpus from the Node backend.
 *
 *   node twinrun/record.js testapi
 *
 * Runs one of the Server's own harness scripts under `record-preload.js`,
 * against a local twin database. Writes, under `twinrun/corpus/<name>/`:
 *
 *   requests.jsonl      every request and Node's response, in order
 *   snapshot.ejson.gz   the database as it was before the first request
 *   meta.json           the clock's start instant and the snapshot's counts
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { SERVER_ROOT } = require('../lib/server');
const { corpusDir, assertLocal, dbUri } = require('./lib/local');

/** The harness scripts a corpus can be recorded from. Arguments keep the data small and the run repeatable. */
const SOURCES = {
  // The Server's functional walk: the main flows in competition order. It seeds its own fixture.
  testapi: { script: path.join(SERVER_ROOT, 'scripts/perf/testApi.js'), args: ['--teams=6', '--json'] },
  // A meet day: every panel seat polling, judges posting slips, spectators on the results page.
  // The script is a concurrent load generator; the recorder queues its requests (see record-preload.js).
  meetday: {
    seed: ['--teams=8', '--players-per-team=4'],
    script: path.join(SERVER_ROOT, 'scripts/perf/meetDay.js'),
    args: ['--minutes=0.2', '--panels=4', '--spectators=4', '--think=0.3-0.6', '--spectator-think=0.5-1', '--slips'],
  },
  // Every operation in the API spec, asked by every kind of user: who is refused, who is let in,
  // and what a missing id or an empty body gets.
  surface: {
    seed: ['--teams=6', '--players-per-team=4', '--scores'],
    script: path.join(__dirname, 'drivers', 'surface.js'),
    args: [],
  },
};

async function main() {
  const name = process.argv[2];
  const source = SOURCES[name];
  if (!source) {
    console.error(`Usage: node twinrun/record.js <${Object.keys(SOURCES).join('|')}>`);
    process.exit(2);
  }
  const database = 'twin_test_node';
  assertLocal(dbUri(database));

  console.log(`twinrun: recording "${name}" from ${path.basename(source.script)} against ${dbUri(database)}`);
  const env = { ...process.env, TWINRUN_CORPUS: name, TWINRUN_DB: database };

  if (source.seed) {
    // The Server's own fixture seeder, pointed at the twin database. The "live" address it compares
    // against is a second local name, so nothing here can name a real database.
    const seeded = spawnSync(process.execPath, [path.join(SERVER_ROOT, 'scripts/perf/seedScale.js'), ...source.seed], {
      cwd: SERVER_ROOT,
      env: { ...env, PERF_MONGODB_URI: dbUri(database), MONGODB_URI: assertLocal(dbUri('twin_test_unused')) },
      encoding: 'utf8',
    });
    if (seeded.status !== 0) {
      console.error(`twinrun: seeding failed\n${seeded.stderr}`);
      process.exit(1);
    }
  }

  const result = spawnSync(
    process.execPath,
    ['-r', path.join(__dirname, 'record-preload.js'), source.script, ...source.args],
    {
      cwd: SERVER_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  const dir = corpusDir(name);
  const requests = require('./lib/corpus').packRequests(name);
  // The harness prints its checks on stderr; the last lines say how the run went.
  const tail = (result.stderr || '').trim().split('\n').slice(-6).join('\n');
  if (tail) console.log(tail);
  console.log(`twinrun: ${requests} requests recorded → ${path.relative(process.cwd(), dir)} (harness exit ${result.status})`);
  if (requests === 0) process.exit(1);

  // What the run left in the database: replays compare their own end state with this.
  const { readDatabase, saveState } = require('./lib/dbdiff');
  const state = await readDatabase(database);
  saveState(state, path.join(dir, 'final-state.json.gz'));
  console.log(`twinrun: end state saved (${Object.values(state).reduce((n, docs) => n + docs.length, 0)} documents in ${Object.keys(state).length} collections)`);
}

main().catch((error) => {
  console.error(`twinrun: ${error.stack || error.message}`);
  process.exit(2);
});
