const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  adminType: {
    type: String,
    enum: ['admin', 'superadmin', 'coach', 'player'], // coach: approving a no-email player's reset or email; player: choosing their team at a level
    required: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  resource: {
    type: String,
    required: true
  },
  resourceId: {
    type: String,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Only createdAt needed for audit log
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
