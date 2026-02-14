const jwt = require('jsonwebtoken');
const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Admin = require('../models/Admin');
const { isTokenInvalidated } = require('../utils/tokenInvalidation');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    // Check if user exists and is active
    let user = null;
    if (decoded.userType === 'player') {
      user = await Player.findById(decoded.userId).select('-password');
    } else if (decoded.userType === 'coach') {
      user = await Coach.findById(decoded.userId).select('-password');
    } else if (decoded.userType === 'admin' || decoded.userType === 'superadmin') {
      user = await Admin.findById(decoded.userId).select('-password');
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    // For admins, check if token has been invalidated due to assignment changes
    if (decoded.userType === 'admin' && decoded.iat) {
      if (isTokenInvalidated(decoded.userId, decoded.iat)) {
        return res.status(401).json({ 
          message: 'Token is no longer valid. Your competition assignments have changed. Please log in again.',
          code: 'TOKEN_INVALIDATED_ASSIGNMENT_CHANGE'
        });
      }
    }

    req.user = user;
    req.userType = decoded.userType;
    
    // Attach competition context from token if present
    if (decoded.currentCompetition) {
      req.user.currentCompetition = decoded.currentCompetition;
    }
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if user is a coach
const coachAuth = (req, res, next) => {
  if (req.userType !== 'coach') {
    return res.status(403).json({ message: 'Access denied. Coach privileges required.' });
  }
  next();
};

// Middleware to check if user is a player
const playerAuth = (req, res, next) => {
  if (req.userType !== 'player') {
    return res.status(403).json({ message: 'Access denied. Player privileges required.' });
  }
  next();
};

// Middleware to check if user is an admin
const adminAuth = (req, res, next) => {
  if (req.userType !== 'admin' && req.userType !== 'superadmin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Middleware to check if user is a super admin
const superAdminAuth = (req, res, next) => {
  if (req.userType !== 'superadmin') {
    return res.status(403).json({ message: 'Access denied. Super Admin privileges required.' });
  }
  
  // Also check the role in the user object
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Access denied. Super Admin privileges required.' });
  }
  
  next();
};

module.exports = {
  authMiddleware,
  coachAuth,
  playerAuth,
  adminAuth,
  superAdminAuth
};
