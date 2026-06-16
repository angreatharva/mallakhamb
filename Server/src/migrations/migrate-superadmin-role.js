/**
 * Migration: Standardize admin role naming
 * 
 * Renames all Admin documents with role 'super_admin' to 'superadmin'.
 * This is a one-time migration to align the database with the standardized
 * role naming convention used across the full stack.
 * 
 * Usage:
 *   node src/migrations/migrate-superadmin-role.js
 * 
 * Requires MONGODB_URI environment variable (or loads from .env).
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
