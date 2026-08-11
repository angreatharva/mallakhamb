/**
 * Migration: Standardize admin role naming
 * 
 * Renames all Admin documents with role 'super_admin' to 'superadmin'.
 * This is a one-time migration to align the database with the standardized
 * role naming convention used across the full stack.
 * 
 * Usage:
 *   node scripts/migrate-superadmin-role.js
 *
 * Requires MONGODB_URI environment variable (or loads from .env).
 *
 * NOT a MigrationRunner migration, which is why it lives in scripts/ alongside
 * createAdmin.js rather than in src/migrations/. It exports no up/down, opens
 * its own mongoose connection and calls mongoose.disconnect() and process.exit()
 * at module scope.
 *
 * While it sat in src/migrations/ it broke the runner outright:
 * validateMigrationOrder rejects any filename not matching ###_name.js, and it
 * runs BEFORE the execution loop — so `npm run migrate:up` aborted having
 * applied nothing, which is why production showed 0 of 4 applied. Renaming it
 * to conform would have been worse than the abort: loadMigration's require()
 * executes module scope, so it would have connected, mutated, and torn down the
 * runner's own connection mid-batch, exactly when the runner needed it to roll
 * back.
 *
 * Almost certainly a no-op now — the super_admin to superadmin rename landed in
 * Phase 1 and the Admin role enum no longer accepts 'super_admin'. Kept as a
 * record and because it is safely idempotent (it counts first and exits early).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI or MONGO_URI environment variable is required');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected');

  const db = mongoose.connection.db;
  const adminsCollection = db.collection('admins');

  // Count documents with old role name
  const count = await adminsCollection.countDocuments({ role: 'super_admin' });
  console.log(`📊 Found ${count} admin(s) with role 'super_admin'`);

  if (count === 0) {
    console.log('✅ No migration needed — all roles are already standardized');
    await mongoose.disconnect();
    return;
  }

  // Update all super_admin → superadmin
  const result = await adminsCollection.updateMany(
    { role: 'super_admin' },
    { $set: { role: 'superadmin' } }
  );

  console.log(`✅ Migrated ${result.modifiedCount} admin(s): 'super_admin' → 'superadmin'`);

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
