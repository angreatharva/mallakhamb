#!/usr/bin/env node
/**
 * Database Migration CLI  (AUDIT task 3.4 / LOW-1)
 *
 * Restores `npm run migrate:up | migrate:down | migrate:status`, which pointed at
 * this file even though it did not exist. It is a thin wrapper around
 * `src/infrastructure/database/migration-runner.js` — all migration logic lives
 * there; this file only handles process concerns (env, DB lifecycle, exit code).
 *
 * Usage:
 *   node scripts/migrate.js up      # apply every pending migration
 *   node scripts/migrate.js down    # roll back the most recently applied migration
 *   node scripts/migrate.js status  # print applied/pending state, change nothing
 *
 * Migrations are discovered by MigrationRunner scanning src/migrations/ at
 * runtime — nothing is hardcoded here, so new migration files are picked up
 * automatically.
 *
 * Bootstrapping mirrors server.js exactly: dotenv → config.load() → DI container
 * → databaseConnection.connect(). Exits non-zero on any failure and always closes
 * the Mongo connection.
 */

const dotenv = require('dotenv');

// Load environment variables FIRST, exactly as server.js does.
dotenv.config();

const config = require('../src/config/config-manager');
const { bootstrap } = require('../src/infrastructure/bootstrap');
const MigrationRunner = require('../src/infrastructure/database/migration-runner');

const COMMANDS = ['up', 'down', 'status'];

function usage() {
  process.stderr.write(
    'Usage: node scripts/migrate.js <up|down|status>\n' +
    '  up      Apply all pending migrations (rolls back the batch on failure)\n' +
    '  down    Roll back the most recently applied migration\n' +
    '  status  Show applied and pending migrations\n'
  );
}

/**
 * Render `getStatus()` output as a readable table.
 * @param {Object} status - Result of MigrationRunner#getStatus
 */
function printStatus(status) {
  const lines = [];
  lines.push('');
  lines.push(`Migrations: ${status.total} total · ${status.applied} applied · ${status.pending} pending`);
  lines.push('');

  if (status.migrations.length === 0) {
    lines.push('  (no migration files found)');
  } else {
    for (const m of status.migrations) {
      const marker = m.status === 'applied' ? '[x]' : '[ ]';
      const when = m.appliedAt ? new Date(m.appliedAt).toISOString() : '-';
      const took = m.executionTime != null ? `${m.executionTime}ms` : '-';
      lines.push(`  ${marker} ${m.name.padEnd(44)} ${m.status.padEnd(8)} ${when.padEnd(26)} ${took}`);
    }
  }

  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS.includes(command)) {
    if (command) process.stderr.write(`Unknown command: ${command}\n\n`);
    usage();
    process.exitCode = 1;
    return;
  }

  // Validate configuration up front — a bad MONGODB_URI should fail loudly here
  // rather than halfway through a migration.
  config.load();

  const { container } = bootstrap();
  const logger = container.resolve('logger');
  const databaseConnection = container.resolve('databaseConnection');

  let connected = false;

  try {
    await databaseConnection.connect();
    connected = true;

    const runner = new MigrationRunner(logger);
    await runner.initialize();

    if (command === 'up') {
      const result = await runner.migrateUp();
      logger.info(result.message);
      process.stdout.write(`${result.message}\n`);
    } else if (command === 'down') {
      const result = await runner.migrateDown();
      logger.info(result.message);
      process.stdout.write(`${result.message}\n`);
    } else {
      const status = await runner.getStatus();
      printStatus(status);
    }

    process.exitCode = 0;
  } catch (error) {
    // logger may be unavailable if bootstrap itself failed; stderr always is.
    process.stderr.write(`\nMigration ${command} failed: ${error.message}\n`);
    if (error.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await databaseConnection.disconnect();
      } catch (closeError) {
        process.stderr.write(`Failed to close the database connection: ${closeError.message}\n`);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`\nUnexpected failure: ${error && error.message}\n`);
  process.exit(1);
});
