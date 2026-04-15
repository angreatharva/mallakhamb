#!/usr/bin/env node

/**
 * Migration CLI
 * 
 * Commands:
 *   npm run migrate:up      - Run all pending migrations
 *   npm run migrate:down    - Rollback the last migration
 *   npm run migrate:status  - Show migration status
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MigrationRunner = require('../src/infrastructure/database/migration-runner');

// Simple console logger for CLI
const logger = {
  info: (message, meta) => {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  warn: (message, meta) => {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  error: (message, meta) => {
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }
};

/**
 * Connect to database
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      family: 4
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    process.exit(1);
  }
}

/**
 * Disconnect from database
 */
async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('✓ Disconnected from MongoDB');
  } catch (error) {
    console.error('✗ Error disconnecting:', error.message);
  }
}

/**
 * Run migrations up
 */
async function migrateUp() {
  console.log('\n📦 Running migrations up...\n');
  
  const runner = new MigrationRunner(logger);
  
  try {
    const result = await runner.migrateUp();
    
    if (result.migrations.length > 0) {
      console.log('\n✅ Migrations completed:');
      result.migrations.forEach(m => {
        console.log(`  - ${m.filename} (${m.executionTime}ms)`);
      });
    } else {
      console.log('\n✓ No pending migrations');
    }
    
    return 0;
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    return 1;
  }
}

/**
 * Run migrations down (rollback)
 */
async function migrateDown() {
  console.log('\n📦 Rolling back last migration...\n');
  
  const runner = new MigrationRunner(logger);
  
  try {
    const result = await runner.migrateDown();
    
    if (result.migration) {
      console.log(`\n✅ Rolled back: ${result.migration.filename} (${result.migration.executionTime}ms)`);
    } else {
      console.log('\n✓ No migrations to rollback');
    }
    
    return 0;
  } catch (error) {
    console.error('\n❌ Rollback failed:', error.message);
    return 1;
  }
}

/**
 * Show migration status
 */
async function migrateStatus() {
  console.log('\n📊 Migration Status\n');
  
  const runner = new MigrationRunner(logger);
  
  try {
    const status = await runner.getStatus();
    
    console.log(`Total migrations: ${status.total}`);
    console.log(`Applied: ${status.applied}`);
    console.log(`Pending: ${status.pending}\n`);
    
    if (status.migrations.length > 0) {
      console.log('Migrations:');
      status.migrations.forEach(m => {
        const statusIcon = m.status === 'applied' ? '✓' : '○';
        const appliedInfo = m.appliedAt 
          ? ` (applied ${new Date(m.appliedAt).toLocaleString()}, ${m.executionTime}ms)`
          : '';
        console.log(`  ${statusIcon} ${m.name}${appliedInfo}`);
      });
    } else {
      console.log('No migrations found');
    }
    
    return 0;
  } catch (error) {
    console.error('\n❌ Error getting status:', error.message);
    return 1;
  }
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];
  
  if (!command) {
    console.log(`
Migration CLI

Usage:
  npm run migrate:up      - Run all pending migrations
  npm run migrate:down    - Rollback the last migration
  npm run migrate:status  - Show migration status

Examples:
  npm run migrate:up
  npm run migrate:down
  npm run migrate:status
    `);
    process.exit(0);
  }
  
  await connectDB();
  
  let exitCode = 0;
  
  try {
    switch (command) {
      case 'up':
        exitCode = await migrateUp();
        break;
      case 'down':
        exitCode = await migrateDown();
        break;
      case 'status':
        exitCode = await migrateStatus();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Valid commands: up, down, status');
        exitCode = 1;
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    exitCode = 1;
  } finally {
    await disconnectDB();
    process.exit(exitCode);
  }
}

// Run CLI
main();
