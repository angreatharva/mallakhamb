/**
 * Guards the migration runner's file discovery and ordering.
 *
 * `migrate-superadmin-role.js` sat in `src/migrations/` while being a
 * standalone script rather than a runner migration. `validateMigrationOrder`
 * rejects any filename not matching `###_name.js`, and `migrateUp` calls it
 * BEFORE the execution loop — so `npm run migrate:up` aborted having applied
 * nothing. Production sat at 0 of 4 migrations applied for exactly this reason,
 * with no visible error until someone ran `migrate:status`.
 *
 * The failure was silent in the worst way: `migrate:status` happily listed the
 * offender as "pending", implying it would run.
 *
 * These tests assert the two properties that keep the runner usable:
 * every discovered file conforms, and the numbering has no gaps.
 */

const MigrationRunner = require('../../../../src/infrastructure/database/migration-runner');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function buildRunner() {
  try {
    return new MigrationRunner(noopLogger);
  } catch {
    return new MigrationRunner({ logger: noopLogger });
  }
}

describe('MigrationRunner file discovery', () => {
  const runner = buildRunner();

  it('every migration on disk follows the ###_name.js convention', async () => {
    const files = await runner.getMigrationFiles();

    // Non-empty first: an empty list passes validateMigrationOrder trivially.
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(file).toMatch(/^\d{3}_[a-z0-9_]+\.js$/i);
    }
  });

  it('the real migrations directory validates, so migrate:up can run', async () => {
    const files = await runner.getMigrationFiles();

    // This is the exact call migrateUp makes before its execution loop. If it
    // throws, `npm run migrate:up` applies nothing at all.
    expect(() => runner.validateMigrationOrder(files)).not.toThrow();
  });

  it('excludes the template, which is not a migration', async () => {
    const files = await runner.getMigrationFiles();
    expect(files.some((f) => f.includes('template'))).toBe(false);
  });

  it('rejects a non-conforming filename', () => {
    // The regression itself: a standalone script dropped into src/migrations/.
    expect(() =>
      runner.validateMigrationOrder([
        '001_initial_indexes.js',
        'migrate-superadmin-role.js',
      ]),
    ).toThrow(/naming convention/i);
  });

  it('rejects a gap in the numbering', () => {
    expect(() =>
      runner.validateMigrationOrder(['001_a.js', '003_c.js']),
    ).toThrow(/Expected 002_/);
  });
});
