# Database Migration System

This document describes the database migration system for the Mallakhamb Competition Management System.

## Overview

The migration system provides a structured way to manage database schema changes and data migrations with:

- **Version Control**: Migrations are numbered and run in order
- **Tracking**: Applied migrations are tracked in the database
- **Rollback**: Support for rolling back migrations
- **Validation**: Migration order and dependencies are validated
- **Safety**: Automatic rollback on failure

## Architecture

### Components

1. **MigrationRunner** (`migration-runner.js`)
   - Core migration engine
   - Handles migration execution, tracking, and rollback
   - Validates migration order and dependencies

2. **Migration Files** (`src/migrations/`)
   - Individual migration scripts
   - Named with convention: `###_description.js`
   - Each has `up()` and `down()` functions

3. **Migration CLI** (`scripts/migrate.js`)
   - Command-line interface for running migrations
   - Provides `up`, `down`, and `status` commands

4. **Migration Tracking Collection**
   - MongoDB collection that tracks applied migrations
   - Stores migration name, status, execution time, and errors

## Usage

### Running Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback the last migration
npm run migrate:down

# Check migration status
npm run migrate:status
```

### Creating a New Migration

1. Copy the migration template:
   ```bash
   cp Server/src/migrations/migration-template.js Server/src/migrations/002_your_migration.js
   ```

2. Edit the migration file:
   ```javascript
   async function up() {
     // Add your migration logic
     const Model = require('../../models/ModelName');
     await Model.collection.createIndex({ fieldName: 1 });
   }

   async function down() {
     // Add rollback logic
     const Model = require('../../models/ModelName');
     await Model.collection.dropIndex('fieldName_1');
   }

   module.exports = { up, down };
   ```

3. Run the migration:
   ```bash
   npm run migrate:up
   ```

## Migration Naming Convention

Migrations must follow the naming convention: `###_description.js`

- **###**: Three-digit number (001, 002, 003, etc.)
- **description**: Brief description using snake_case
- **.js**: JavaScript file extension

Examples:
- `001_initial_indexes.js`
- `002_add_user_fields.js`
- `003_migrate_team_data.js`

The number prefix ensures migrations run in the correct order.

## Migration Types

### Schema Migrations

Add or modify database indexes, constraints, or structure:

```javascript
async function up() {
  const Player = require('../../models/Player');
  
  // Add index
  await Player.collection.createIndex({ email: 1 }, { unique: true });
  
  // Add compound index
  await Player.collection.createIndex({ ageGroup: 1, gender: 1 });
}

async function down() {
  const Player = require('../../models/Player');
  
  // Drop indexes
  await Player.collection.dropIndex('email_1');
  await Player.collection.dropIndex('ageGroup_1_gender_1');
}
```

### Data Migrations

Transform or update existing data:

```javascript
async function up() {
  const Player = require('../../models/Player');
  
  // Add new field with default value
  await Player.updateMany(
    { newField: { $exists: false } },
    { $set: { newField: 'defaultValue' } }
  );
}

async function down() {
  const Player = require('../../models/Player');
  
  // Remove field
  await Player.updateMany({}, { $unset: { newField: '' } });
}
```

## Migration Status

The migration system tracks the following states:

- **pending**: Migration file exists but hasn't been run
- **applied**: Migration successfully executed
- **failed**: Migration execution failed
- **rolled_back**: Migration was rolled back

## Error Handling

### Automatic Rollback

If a migration fails during `migrate:up`, the system automatically rolls back all migrations applied in that batch:

```
Running migration: 002_add_fields.js
❌ Migration failed: 002_add_fields.js
Rolling back: 001_initial_indexes.js
✓ Rollback complete
```

### Manual Rollback

You can manually rollback the last migration:

```bash
npm run migrate:down
```

## Production Safety

### Requirement 24.8: Prevent Running Server with Pending Migrations

To ensure production safety, check for pending migrations before starting the server:

```javascript
const MigrationRunner = require('./src/infrastructure/database/migration-runner');

async function startServer() {
  // Check for pending migrations in production
  if (process.env.NODE_ENV === 'production') {
    const runner = new MigrationRunner(logger);
    const hasPending = await runner.hasPendingMigrations();
    
    if (hasPending) {
      logger.error('Cannot start server: pending migrations detected');
      logger.error('Run "npm run migrate:up" to apply migrations');
      process.exit(1);
    }
  }
  
  // Start server...
}
```

## Best Practices

### 1. Always Test Migrations

Test migrations in development before running in production:

```bash
# Development
npm run migrate:up
npm run migrate:down  # Test rollback
npm run migrate:up    # Re-apply
```

### 2. Keep Migrations Small

Create focused migrations that do one thing:

✅ Good:
- `001_add_player_indexes.js`
- `002_add_competition_indexes.js`

❌ Bad:
- `001_add_all_indexes_and_migrate_data.js`

### 3. Make Migrations Reversible

Always implement both `up()` and `down()` functions:

```javascript
async function up() {
  // Add feature
}

async function down() {
  // Remove feature (undo up())
}
```

### 4. Handle Idempotency

Migrations should be safe to run multiple times:

```javascript
async function up() {
  const Model = require('../../models/Model');
  
  // Check if index exists before creating
  const indexes = await Model.collection.indexes();
  const indexExists = indexes.some(idx => idx.name === 'fieldName_1');
  
  if (!indexExists) {
    await Model.collection.createIndex({ fieldName: 1 });
  }
}
```

### 5. Use Transactions for Data Migrations

For complex data migrations, use MongoDB transactions:

```javascript
async function up() {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const Model = require('../../models/Model');
    
    // Perform updates within transaction
    await Model.updateMany({}, { $set: { newField: 'value' } }, { session });
    
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

## Troubleshooting

### Migration Stuck in "failed" State

If a migration fails and you fix the issue, you need to manually update the migration status:

```javascript
// In MongoDB shell or script
db.migrations.updateOne(
  { name: '002_failed_migration.js' },
  { $set: { status: 'pending' } }
);
```

Then re-run:
```bash
npm run migrate:up
```

### Index Already Exists Error

If you get "index already exists" errors, the migration may have partially completed. Check existing indexes:

```javascript
// In MongoDB shell
db.players.getIndexes()
```

Drop the problematic index manually if needed:
```javascript
db.players.dropIndex('indexName')
```

### Migration Order Issues

If migrations are out of order, the system will reject them. Ensure migration numbers are sequential:

```
001_first.js
002_second.js
003_third.js
```

## Monitoring

### Check Migration Status

```bash
npm run migrate:status
```

Output:
```
📊 Migration Status

Total migrations: 3
Applied: 2
Pending: 1

Migrations:
  ✓ 001_initial_indexes.js (applied 2024-01-15 10:30:00, 1234ms)
  ✓ 002_add_user_fields.js (applied 2024-01-15 10:35:00, 567ms)
  ○ 003_migrate_team_data.js
```

### View Migration History

Query the migrations collection directly:

```javascript
db.migrations.find().sort({ appliedAt: -1 })
```

## Integration with CI/CD

### Pre-deployment Check

Add migration check to your deployment pipeline:

```bash
# Check for pending migrations
npm run migrate:status

# Run migrations
npm run migrate:up

# Start server
npm start
```

### Rollback Strategy

If deployment fails, rollback migrations:

```bash
# Rollback last migration
npm run migrate:down

# Rollback multiple migrations
npm run migrate:down
npm run migrate:down
```

## References

- **Requirements**: 24.1-24.8 (Database Migration Support)
- **Design**: Migration system architecture
- **Implementation**: `src/infrastructure/database/migration-runner.js`

## Support

For issues or questions about migrations:
1. Check this README
2. Review migration logs
3. Check the migrations collection in MongoDB
4. Consult the development team
