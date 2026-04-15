const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;

/**
 * Migration Runner
 * Manages database migrations with tracking, validation, and rollback support
 */
class MigrationRunner {
  constructor(logger) {
    this.logger = logger;
    this.migrationsPath = path.join(__dirname, '../../migrations');
    this.migrationModel = null;
  }

  /**
   * Initialize migration tracking collection
   */
  async initialize() {
    // Create migration tracking schema if not exists
    if (!this.migrationModel) {
      // Check if model already exists
      if (mongoose.models.Migration) {
        this.migrationModel = mongoose.models.Migration;
      } else {
        const migrationSchema = new mongoose.Schema({
          name: { type: String, required: true, unique: true },
          appliedAt: { type: Date, default: Date.now },
          executionTime: { type: Number }, // milliseconds
          status: { 
            type: String, 
            enum: ['pending', 'applied', 'failed', 'rolled_back'],
            default: 'pending'
          },
          error: { type: String }
        });

        this.migrationModel = mongoose.model('Migration', migrationSchema);
      }
    }

    this.logger.info('Migration runner initialized');
  }

  /**
   * Get all migration files from migrations directory
   * @returns {Promise<Array<string>>} Sorted array of migration filenames
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.js') && !file.includes('template'))
        .sort(); // Ensures migrations run in order (001_, 002_, etc.)
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('Migrations directory not found', { path: this.migrationsPath });
        return [];
      }
      throw error;
    }
  }

  /**
   * Get applied migrations from database
   * @returns {Promise<Array<Object>>} Array of applied migration records
   */
  async getAppliedMigrations() {
    await this.initialize();
    return await this.migrationModel.find({ status: 'applied' }).sort({ appliedAt: 1 });
  }

  /**
   * Get pending migrations
   * @returns {Promise<Array<string>>} Array of pending migration filenames
   */
  async getPendingMigrations() {
    const allFiles = await this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const appliedNames = new Set(applied.map(m => m.name));
    
    return allFiles.filter(file => !appliedNames.has(file));
  }

  /**
   * Validate migration order and dependencies
   * @param {Array<string>} migrations - Migration filenames to validate
   * @throws {Error} If validation fails
   */
  validateMigrationOrder(migrations) {
    // Check that migrations follow naming convention (001_, 002_, etc.)
    const numberPattern = /^(\d{3})_/;
    
    for (let i = 0; i < migrations.length; i++) {
      const match = migrations[i].match(numberPattern);
      if (!match) {
        throw new Error(`Migration ${migrations[i]} does not follow naming convention (###_name.js)`);
      }
      
      const number = parseInt(match[1], 10);
      const expectedNumber = i + 1;
      
      if (number !== expectedNumber) {
        throw new Error(
          `Migration order error: Expected ${expectedNumber.toString().padStart(3, '0')}_ but found ${migrations[i]}`
        );
      }
    }
    
    this.logger.info('Migration order validated', { count: migrations.length });
  }

  /**
   * Load a migration module
   * @param {string} filename - Migration filename
   * @returns {Promise<Object>} Migration module with up/down functions
   */
  async loadMigration(filename) {
    const migrationPath = path.join(this.migrationsPath, filename);
    const migration = require(migrationPath);
    
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${filename} missing 'up' function`);
    }
    
    if (typeof migration.down !== 'function') {
      throw new Error(`Migration ${filename} missing 'down' function`);
    }
    
    return migration;
  }

  /**
   * Run a single migration up
   * @param {string} filename - Migration filename
   * @returns {Promise<Object>} Migration result
   */
  async runMigrationUp(filename) {
    await this.initialize();
    
    const startTime = Date.now();
    this.logger.info('Running migration up', { migration: filename });
    
    try {
      // Load migration
      const migration = await this.loadMigration(filename);
      
      // Execute up migration
      await migration.up();
      
      const executionTime = Date.now() - startTime;
      
      // Record successful migration
      await this.migrationModel.findOneAndUpdate(
        { name: filename },
        {
          name: filename,
          appliedAt: new Date(),
          executionTime,
          status: 'applied',
          error: null
        },
        { upsert: true, new: true }
      );
      
      this.logger.info('Migration completed successfully', { 
        migration: filename, 
        executionTime: `${executionTime}ms` 
      });
      
      return { success: true, filename, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Record failed migration
      await this.migrationModel.findOneAndUpdate(
        { name: filename },
        {
          name: filename,
          status: 'failed',
          error: error.message,
          executionTime
        },
        { upsert: true, new: true }
      );
      
      this.logger.error('Migration failed', { 
        migration: filename, 
        error: error.message,
        executionTime: `${executionTime}ms`
      });
      
      throw error;
    }
  }

  /**
   * Run a single migration down (rollback)
   * @param {string} filename - Migration filename
   * @returns {Promise<Object>} Migration result
   */
  async runMigrationDown(filename) {
    await this.initialize();
    
    const startTime = Date.now();
    this.logger.info('Rolling back migration', { migration: filename });
    
    try {
      // Load migration
      const migration = await this.loadMigration(filename);
      
      // Execute down migration
      await migration.down();
      
      const executionTime = Date.now() - startTime;
      
      // Update migration status
      await this.migrationModel.findOneAndUpdate(
        { name: filename },
        {
          status: 'rolled_back',
          executionTime
        }
      );
      
      this.logger.info('Migration rolled back successfully', { 
        migration: filename, 
        executionTime: `${executionTime}ms` 
      });
      
      return { success: true, filename, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error('Migration rollback failed', { 
        migration: filename, 
        error: error.message,
        executionTime: `${executionTime}ms`
      });
      
      throw error;
    }
  }

  /**
   * Run all pending migrations
   * @returns {Promise<Object>} Migration results
   */
  async migrateUp() {
    await this.initialize();
    
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      this.logger.info('No pending migrations');
      return { success: true, migrations: [], message: 'No pending migrations' };
    }
    
    // Validate migration order
    const allFiles = await this.getMigrationFiles();
    this.validateMigrationOrder(allFiles);
    
    this.logger.info('Starting migration up', { count: pending.length, migrations: pending });
    
    const results = [];
    
    for (const filename of pending) {
      try {
        const result = await this.runMigrationUp(filename);
        results.push(result);
      } catch (error) {
        // Rollback on failure
        this.logger.error('Migration failed, initiating rollback', { 
          failed: filename,
          error: error.message 
        });
        
        // Rollback all migrations applied in this batch
        for (const appliedResult of results) {
          try {
            await this.runMigrationDown(appliedResult.filename);
          } catch (rollbackError) {
            this.logger.error('Rollback failed', { 
              migration: appliedResult.filename,
              error: rollbackError.message 
            });
          }
        }
        
        throw new Error(`Migration failed: ${filename}. Rolled back ${results.length} migration(s). Error: ${error.message}`);
      }
    }
    
    this.logger.info('All migrations completed successfully', { count: results.length });
    
    return { 
      success: true, 
      migrations: results,
      message: `Successfully applied ${results.length} migration(s)`
    };
  }

  /**
   * Rollback the last migration
   * @returns {Promise<Object>} Migration result
   */
  async migrateDown() {
    await this.initialize();
    
    const applied = await this.getAppliedMigrations();
    
    if (applied.length === 0) {
      this.logger.info('No migrations to rollback');
      return { success: true, message: 'No migrations to rollback' };
    }
    
    // Get the last applied migration
    const lastMigration = applied[applied.length - 1];
    
    this.logger.info('Rolling back last migration', { migration: lastMigration.name });
    
    const result = await this.runMigrationDown(lastMigration.name);
    
    return { 
      success: true, 
      migration: result,
      message: `Successfully rolled back migration: ${lastMigration.name}`
    };
  }

  /**
   * Get migration status
   * @returns {Promise<Object>} Migration status information
   */
  async getStatus() {
    await this.initialize();
    
    const allFiles = await this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    
    const appliedNames = new Set(applied.map(m => m.name));
    
    const status = {
      total: allFiles.length,
      applied: applied.length,
      pending: pending.length,
      migrations: allFiles.map(filename => ({
        name: filename,
        status: appliedNames.has(filename) ? 'applied' : 'pending',
        appliedAt: applied.find(m => m.name === filename)?.appliedAt || null,
        executionTime: applied.find(m => m.name === filename)?.executionTime || null
      }))
    };
    
    return status;
  }

  /**
   * Check if there are pending migrations (for production safety)
   * @returns {Promise<boolean>} True if there are pending migrations
   */
  async hasPendingMigrations() {
    const pending = await this.getPendingMigrations();
    return pending.length > 0;
  }
}

module.exports = MigrationRunner;
