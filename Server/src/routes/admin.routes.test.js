const request = require('supertest');
const express = require('express');

// Set up the app structure similar to loadRoutes but isolated
const app = express();
app.use(express.json());

// We mock the auth middleware to isolate route tests
jest.mock('../middleware/auth.middleware', () => {
  const createAuthMiddleware = () => (req, res, next) => {
    if (req.header('Authorization')) {
      req.user = { role: req.header('Role') || 'player' };
      next();
    } else {
      res.status(401).json({ message: 'No authorization token provided' });
    }
  };

  const requireRole = (roles) => (req, res, next) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: 'Insufficient permissions' });
    }
  };

  createAuthMiddleware.requireRole = requireRole;
  createAuthMiddleware.requireAdmin = requireRole(['admin', 'superadmin']);
  createAuthMiddleware.requireSuperAdmin = requireRole('superadmin');
  createAuthMiddleware.createAuthMiddleware = createAuthMiddleware;
  
  return createAuthMiddleware;
});

const mockContainer = {
  resolve: jest.fn((key) => {
    if (key === 'logger') return { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    if (key === 'config') return { get: jest.fn() };
    if (key === 'adminController') {
      return new Proxy({}, {
        get: (target, prop) => {
          if (prop === 'registerAdmin') return (req, res) => res.status(201).json({ success: true });
          return (req, res) => res.status(200).json({ success: true });
        }
      });
    }
    return {};
  })
};

const createAdminRoutes = require('./admin.routes');
app.use('/api/admin', createAdminRoutes(mockContainer));

describe('Admin Routes - Auth Guards', () => {
  describe('POST /api/admin/register', () => {
    it('should block unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(401);
    });

    it('should block requests from non-superadmin roles', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'admin') // authenticated but wrong role
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(403);
    });

    it('should allow requests from superadmin', async () => {
      const response = await request(app)
        .post('/api/admin/register')
        .set('Authorization', 'Bearer fake-token')
        .set('Role', 'superadmin')
        .send({ email: 'newadmin@test.com' });

      expect(response.status).toBe(201);
    });
  });
});
