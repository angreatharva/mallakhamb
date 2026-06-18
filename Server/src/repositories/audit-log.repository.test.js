const mongoose = require('mongoose');
const AuditLogRepository = require('./audit-log.repository');
const AuditLog = require('../models/AuditLog');

describe('AuditLogRepository', () => {
  let repository;

  beforeAll(() => {
    const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    repository = new AuditLogRepository(mockLogger);
  });

  afterEach(async () => {
    await AuditLog.deleteMany({});
  });

  describe('logAction', () => {
    it('should create a new audit log entry', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const logData = {
        adminId,
        adminType: 'admin',
        action: 'USER_CREATED',
        resource: 'API',
        resourceId: 'user123',
        details: { test: true },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const result = await repository.logAction(logData);

      expect(result).toBeDefined();
      expect(result.adminId.toString()).toBe(adminId.toString());
      expect(result.action).toBe('USER_CREATED');
      
      const inDb = await AuditLog.findById(result._id);
      expect(inDb).toBeDefined();
      expect(inDb.action).toBe('USER_CREATED');
    });
  });

  describe('getAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      const adminId = new mongoose.Types.ObjectId();
      
      // Create 5 logs
      for (let i = 0; i < 5; i++) {
        await AuditLog.create({
          adminId,
          adminType: 'admin',
          action: 'TEST_ACTION',
          resource: 'API',
          resourceId: `res${i}`
        });
      }

      // Get page 1, limit 2
      const result = await repository.getAuditLogs({}, { page: 1, limit: 2 });
      
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.pages).toBe(3);
    });
  });
});
