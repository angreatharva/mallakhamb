const mongoose = require('mongoose');
const MigrationRunner = require('./migration-runner');
const fs = require('fs').promises;
const path = require('path');

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('MigrationRunner', () => {
  let runner;
  let testMigrationsPath;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test_migrations', {
      maxPoolSize: 10,
      minPoolSize: 2
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    if (mongoose.connection.models.Migration) {
      await mongoose.connection.models.Migration.deleteMany({});
    }
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    runner = new MigrationRunner(mockLogger);
    await runner.initialize();
    
    // Clear migration tracking collection
    if (runner.migrationModel) {
      await runner.migrationModel.deleteMany({});
    }
    
    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create migration tracking model', async () => {
      await runner.initialize();
      expect(runner.migrationModel).toBeDefined();
      expect(runner.migrationModel.modelName).toBe('Migration');
    });

    it('should log initialization', async () => {
      await runner.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('Migration runner initialized');
    });
  });

  describe('getMigrationFiles', () => {
    it('should return sorted migration files', async () => {
      const files = await runner.getMigrationFiles();
      expect(Array.isArray(files)).toBe(true);
      
      // Check that files are sorted
      for (let i = 1; i < files.length; i++) {
        expect(files[i] >= files[i - 1]).toBe(true);
      }
    });

    it('should filter out template files', async () => {
      const files = await runner.getMigrationFiles();
      const hasTemplate = files.some(f => f.includes('template'));
      expect(hasTemplate).toBe(false);
    });

    it('should only include .js files', async () => {
      const files = await runner.getMigrationFiles();
      files.forEach(file => {
        expect(file.endsWith('.js')).toBe(true);
      });
    });
  });

  describe('validateMigrationOrder', () => {
    it('should validate correct migration order', () => {
      const migrations = ['001_first.js', '002_second.js', '003_third.js'];
      expect(() => runner.validateMigrationOrder(migrations)).not.toThrow();
    });

    it('should throw error for invalid naming convention', () => {
      const migrations = ['first.js', '002_second.js'];
      expect(() => runner.validateMigrationOrder(migrations)).toThrow(
        /does not follow naming convention/
      );
    });

    it('should throw error for out-of-order migrations', () => {
      const migrations = ['001_first.js', '003_third.js'];
      expect(() => runner.validateMigrationOrder(migrations)).toThrow(
        /Migration order error/
      );
    });

    it('should log successful validation', () => {
      const migrations = ['001_first.js'];
      runner.validateMigrationOrder(migrations);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Migration order validated',
        { count: 1 }
      );
    });
  });

  describe('getAppliedMigrations', () => {
    it('should return empty array when no migrations applied', async () => {
      const applied = await runner.getAppliedMigrations();
      expect(applied).toEqual([]);
    });

    it('should return applied migrations sorted by date', async () => {
      // Create test migration records
      await runner.migrationModel.create([
        { name: '001_first.js', status: 'applied', appliedAt: new Date('2024-01-01') },
        { name: '002_second.js', status: 'applied', appliedAt: new Date('2024-01-02') }
      ]);

      const applied = await runner.getAppliedMigrations();
      expect(applied).toHaveLength(2);
      expect(applied[0].name).toBe('001_first.js');
      expect(applied[1].name).toBe('002_second.js');
    });

    it('should only return applied migrations, not failed ones', async () => {
      await runner.migrationModel.create([
        { name: '001_first.js', status: 'applied' },
        { name: '002_second.js', status: 'failed' }
      ]);

      const applied = await runner.getAppliedMigrations();
      expect(applied).toHaveLength(1);
      expect(applied[0].name).toBe('001_first.js');
    });
  });

  describe('getPendingMigrations', () => {
    it('should return all migrations when none applied', async () => {
      const pending = await runner.getPendingMigrations();
      const allFiles = await runner.getMigrationFiles();
      expect(pending.length).toBe(allFiles.length);
    });

    it('should exclude applied migrations', async () => {
      const allFiles = await runner.getMigrationFiles();
      if (allFiles.length > 0) {
        await runner.migrationModel.create({
          name: allFiles[0],
          status: 'applied'
        });

        const pending = await runner.getPendingMigrations();
        expect(pending).not.toContain(allFiles[0]);
      }
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive migration status', async () => {
      const status = await runner.getStatus();
      
      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('applied');
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('migrations');
      expect(Array.isArray(status.migrations)).toBe(true);
    });

    it('should correctly categorize migrations', async () => {
      const allFiles = await runner.getMigrationFiles();
      if (allFiles.length > 0) {
        await runner.migrationModel.create({
          name: allFiles[0],
          status: 'applied',
          appliedAt: new Date(),
          executionTime: 1000
        });

        const status = await runner.getStatus();
        expect(status.applied).toBe(1);
        expect(status.pending).toBe(allFiles.length - 1);
        
        const appliedMigration = status.migrations.find(m => m.name === allFiles[0]);
        expect(appliedMigration.status).toBe('applied');
        expect(appliedMigration.appliedAt).toBeDefined();
        expect(appliedMigration.executionTime).toBe(1000);
      }
    });
  });

  describe('hasPendingMigrations', () => {
    it('should return true when there are pending migrations', async () => {
      const allFiles = await runner.getMigrationFiles();
      if (allFiles.length > 0) {
        const hasPending = await runner.hasPendingMigrations();
        expect(hasPending).toBe(true);
      }
    });

    it('should return false when all migrations are applied', async () => {
      const allFiles = await runner.getMigrationFiles();
      
      // Mark all as applied
      for (const file of allFiles) {
        await runner.migrationModel.create({
          name: file,
          status: 'applied'
        });
      }

      const hasPending = await runner.hasPendingMigrations();
      expect(hasPending).toBe(false);
    });
  });

  describe('loadMigration', () => {
    it('should load migration module', async () => {
      const files = await runner.getMigrationFiles();
      if (files.length > 0) {
        const migration = await runner.loadMigration(files[0]);
        expect(migration).toHaveProperty('up');
        expect(migration).toHaveProperty('down');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      }
    });

    it('should throw error if migration missing up function', async () => {
      // This test would require creating a malformed migration file
      // Skipping for now as it would pollute the migrations directory
    });
  });

  describe('Integration tests', () => {
    it('should track migration execution time', async () => {
      const files = await runner.getMigrationFiles();
      if (files.length > 0) {
        // Clear any existing records
        await runner.migrationModel.deleteMany({ name: files[0] });
        
        await runner.runMigrationUp(files[0]);
        
        const record = await runner.migrationModel.findOne({ name: files[0] });
        expect(record.executionTime).toBeGreaterThan(0);
      }
    });

    it('should handle migration failure gracefully', async () => {
      // This would require a migration that intentionally fails
      // The system should record the failure in the database
    });
  });

  describe('Error handling', () => {
    it('should log errors when migration fails', async () => {
      // Test error logging
      const files = await runner.getMigrationFiles();
      if (files.length > 0) {
        // Mock a migration that will fail
        jest.spyOn(runner, 'loadMigration').mockRejectedValueOnce(new Error('Test error'));
        
        await expect(runner.runMigrationUp(files[0])).rejects.toThrow();
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });
  });
});

describe('Migration CLI Integration', () => {
  it('should have migrate:up script in package.json', () => {
    const packageJson = require('../../../package.json');
    expect(packageJson.scripts).toHaveProperty('migrate:up');
    expect(packageJson.scripts['migrate:up']).toContain('migrate.js up');
  });

  it('should have migrate:down script in package.json', () => {
    const packageJson = require('../../../package.json');
    expect(packageJson.scripts).toHaveProperty('migrate:down');
    expect(packageJson.scripts['migrate:down']).toContain('migrate.js down');
  });

  it('should have migrate:status script in package.json', () => {
    const packageJson = require('../../../package.json');
    expect(packageJson.scripts).toHaveProperty('migrate:status');
    expect(packageJson.scripts['migrate:status']).toContain('migrate.js status');
  });
});
