const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import all admin controller functions
const adminController = require('./adminController');

// Generate JWT token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Super Admin Login
const loginSuperAdmin = async (req, res) => {
  console.log('🔍 Super Admin login attempt:', { email: req.body.email });
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find admin by email and check if super_admin
    const admin = await Admin.findOne({ email, role: 'super_admin' });
    if (!admin) {
      console.log('❌ Super Admin not found for email:', email);
      return res.status(400).json({ message: 'Invalid credentials or insufficient permissions' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token with superadmin type
    const token = generateToken(admin._id, 'superadmin');

    console.log('✅ Super Admin login successful:', admin.email);
    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('❌ Super Admin login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get all admins (Super Admin only)
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      admins,
      total: admins.length
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new admin (Super Admin only)
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    // Create new admin
    const admin = new Admin({
      name,
      email,
      password,
      role: role || 'admin' // Default to 'admin' if not specified
    });

    await admin.save();

    res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ message: 'Server error during admin creation' });
  }
};

// Update admin (Super Admin only)
const updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { name, email, role, isActive } = req.body;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Prevent super admin from demoting themselves
    if (admin._id.toString() === req.user._id.toString() && role === 'admin') {
      return res.status(400).json({ message: 'Cannot demote yourself' });
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (role) admin.role = role;
    if (typeof isActive !== 'undefined') admin.isActive = isActive;

    await admin.save();

    res.json({
      message: 'Admin updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive
      }
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ message: 'Server error during admin update' });
  }
};

// Delete admin (Super Admin only)
const deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Prevent super admin from deleting themselves
    if (adminId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    const admin = await Admin.findByIdAndDelete(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({
      message: 'Admin deleted successfully',
      adminId
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Server error during admin deletion' });
  }
};

// Get system statistics (Super Admin only)
const getSystemStats = async (req, res) => {
  console.log('📊 Getting system statistics...');
  try {
    const [
      totalAdmins,
      totalCoaches,
      totalPlayers,
      totalTeams,
      totalScores,
      totalJudges,
      activeAdmins,
      activeCoaches,
      activePlayers
    ] = await Promise.all([
      Admin.countDocuments(),
      Coach.countDocuments(),
      Player.countDocuments(),
      Team.countDocuments(),
      Score.countDocuments(),
      Judge.countDocuments({ isActive: true }),
      Admin.countDocuments({ isActive: true }),
      Coach.countDocuments({ isActive: true }),
      Player.countDocuments({ isActive: true })
    ]);

    console.log('✅ System stats retrieved successfully');

    // Get recent activities
    const recentTeams = await Team.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('coach', 'name email')
      .select('name coach createdAt');

    const recentScores = await Score.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('teamId', 'name')
      .select('teamId gender ageGroup createdAt');

    res.json({
      stats: {
        users: {
          totalAdmins,
          totalCoaches,
          totalPlayers,
          activeAdmins,
          activeCoaches,
          activePlayers
        },
        content: {
          totalTeams,
          totalScores,
          totalJudges
        }
      },
      recentActivities: {
        teams: recentTeams,
        scores: recentScores
      }
    });
  } catch (error) {
    console.error('❌ Get system stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all coaches (Super Admin only)
const getAllCoaches = async (req, res) => {
  try {
    const coaches = await Coach.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      coaches,
      total: coaches.length
    });
  } catch (error) {
    console.error('Get all coaches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update coach status (Super Admin only)
const updateCoachStatus = async (req, res) => {
  try {
    const { coachId } = req.params;
    const { isActive } = req.body;

    const coach = await Coach.findById(coachId);
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    coach.isActive = isActive;
    await coach.save();

    res.json({
      message: `Coach ${isActive ? 'activated' : 'deactivated'} successfully`,
      coach: {
        id: coach._id,
        name: coach.name,
        email: coach.email,
        isActive: coach.isActive
      }
    });
  } catch (error) {
    console.error('Update coach status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete team (Super Admin only)
const deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findByIdAndDelete(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Also delete associated scores
    await Score.deleteMany({ teamId });

    res.json({
      message: 'Team and associated scores deleted successfully',
      teamId
    });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete judge (Super Admin only)
const deleteJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;

    const judge = await Judge.findByIdAndDelete(judgeId);
    if (!judge) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    res.json({
      message: 'Judge deleted successfully',
      judgeId
    });
  } catch (error) {
    console.error('Delete judge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Export all functions including inherited admin functions
module.exports = {
  // Super Admin specific functions
  loginSuperAdmin,
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getSystemStats,
  getAllCoaches,
  updateCoachStatus,
  deleteTeam,
  deleteJudge,
  
  // Inherited admin functions
  ...adminController
};
