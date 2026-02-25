const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const CompetitionTeam = require('../models/CompetitionTeam');
const { generateToken } = require('../utils/tokenUtils');
const { recordAdminAssignmentChange } = require('../utils/tokenInvalidation');
const { 
  logAdminAssignmentChange, 
  logCompetitionDeletion,
  logFailedLogin,
  logSuccessfulLogin
} = require('../middleware/securityLogger');
const bcrypt = require('bcryptjs');

// Import all admin controller functions
const adminController = require('./adminController');

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
      logFailedLogin(email, 'superadmin', 'Invalid credentials or not super admin', req);
      return res.status(400).json({ message: 'Invalid credentials or insufficient permissions' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      logFailedLogin(email, 'superadmin', 'Invalid password', req);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token with superadmin type
    const token = generateToken(admin._id, 'superadmin');

    console.log('✅ Super Admin login successful:', admin.email);
    logSuccessfulLogin(admin._id, 'superadmin', req);
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

// Get all teams (Super Admin only - no competition context required)
const getAllTeamsForSuperAdmin = async (req, res) => {
  try {
    // Get all competition teams (team registrations in competitions)
    const competitionTeams = await CompetitionTeam.find()
      .populate('team', 'name description')
      .populate('coach', 'name email')
      .populate('competition', 'name year level place')
      .sort({ createdAt: -1 });

    // Transform to include team details at top level for easier frontend use
    const teams = competitionTeams.map(ct => ({
      _id: ct.team._id,
      name: ct.team.name,
      description: ct.team.description,
      coach: ct.coach,
      competition: ct.competition,
      competitionId: ct.competition._id,
      competitionTeamId: ct._id,
      isSubmitted: ct.isSubmitted,
      paymentStatus: ct.paymentStatus
    }));

    res.json({
      success: true,
      teams,
      total: teams.length
    });
  } catch (error) {
    console.error('Get all teams error:', error);
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

// ============================================
// COMPETITION MANAGEMENT METHODS
// ============================================

// Create Competition
const createCompetition = async (req, res) => {
  try {
    const { name, level, place, year, startDate, endDate, description, status, admins, ageGroups, competitionTypes } = req.body;

    // Validate required fields
    if (!name || !level || !place || !year || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, level, place, year, startDate, and endDate are required' 
      });
    }

    // Validate competition types (required and must be array with at least one item)
    if (!competitionTypes || !Array.isArray(competitionTypes) || competitionTypes.length === 0) {
      return res.status(400).json({ 
        message: 'At least one competition type must be selected' 
      });
    }

    // Validate competition types values
    const validTypes = ['competition_1', 'competition_2', 'competition_3'];
    for (const type of competitionTypes) {
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          message: `Invalid competition type: ${type}. Must be one of: ${validTypes.join(', ')}` 
        });
      }
    }

    // Remove duplicates
    const uniqueCompetitionTypes = [...new Set(competitionTypes)];

    // Check if competition with same name, year, and place already exists
    const existingCompetition = await Competition.findOne({ name, year, place });
    if (existingCompetition) {
      return res.status(400).json({ 
        message: `A competition with the name "${name}" already exists for the year ${year} in ${place}. Please use a different name, year, or place.` 
      });
    }

    // Validate at least one admin is assigned
    if (!admins || !Array.isArray(admins) || admins.length === 0) {
      return res.status(400).json({ 
        message: 'At least one admin must be assigned to the competition' 
      });
    }

    // Validate all admins exist
    const adminDocs = await Admin.find({ _id: { $in: admins } });
    if (adminDocs.length !== admins.length) {
      return res.status(400).json({ 
        message: 'One or more admin IDs are invalid' 
      });
    }

    // Validate age groups (required)
    if (!ageGroups || !Array.isArray(ageGroups) || ageGroups.length === 0) {
      return res.status(400).json({ 
        message: 'At least one age group must be selected' 
      });
    }

    const validAgeGroups = ['Under8', 'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'];
    const validGenders = ['Male', 'Female'];
    
    for (const ag of ageGroups) {
      if (!validGenders.includes(ag.gender)) {
        return res.status(400).json({ 
          message: `Invalid gender: ${ag.gender}. Must be Male or Female` 
        });
      }
      if (!validAgeGroups.includes(ag.ageGroup)) {
        return res.status(400).json({ 
          message: `Invalid age group: ${ag.ageGroup}. Must be one of: ${validAgeGroups.join(', ')}` 
        });
      }
    }

    // Create competition
    const competition = new Competition({
      name,
      level,
      place,
      year,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      description,
      competitionTypes: uniqueCompetitionTypes,
      admins,
      ageGroups,
      createdBy: req.user._id
    });

    // Set initial status based on start date
    competition.setInitialStatus();

    await competition.save();

    // Update each admin's competitions array
    await Admin.updateMany(
      { _id: { $in: admins } },
      { $addToSet: { competitions: competition._id } }
    );

    // Populate admin details for response
    await competition.populate('admins', 'name email');

    res.status(201).json({
      message: 'Competition created successfully',
      competition
    });
  } catch (error) {
    console.error('Create competition error:', error);
    
    // Handle duplicate name error
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: 'A competition with this name already exists' 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: 'Validation error',
        errors: messages 
      });
    }
    
    res.status(500).json({ message: 'Server error during competition creation' });
  }
};

// Get All Competitions with search/filter
const getAllCompetitions = async (req, res) => {
  try {
    const { search, level, place, startDate, endDate, status } = req.query;

    // Build query
    const query = {};

    // Search by name (case-insensitive, partial match)
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Filter by level
    if (level) {
      query.level = level;
    }

    // Filter by place (case-insensitive, partial match)
    if (place) {
      query.place = { $regex: place, $options: 'i' };
    }

    // Filter by date range
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) {
        query.startDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startDate.$lte = new Date(endDate);
      }
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Execute query with admin details
    const competitions = await Competition.find(query)
      .populate('admins', 'name email isActive')
      .populate('createdBy', 'name email')
      .sort({ startDate: -1 });

    res.json({
      success: true,
      competitions,
      total: competitions.length
    });
  } catch (error) {
    console.error('Get all competitions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Competition by ID
const getCompetitionById = async (req, res) => {
  try {
    const { id } = req.params;

    const competition = await Competition.findById(id)
      .populate('admins', 'name email isActive')
      .populate('createdBy', 'name email');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Get related entity counts
    const [teamCount, judgeCount, scoreCount] = await Promise.all([
      Team.countDocuments({ competition: id }),
      Judge.countDocuments({ competition: id }),
      Score.countDocuments({ competition: id })
    ]);

    res.json({
      success: true,
      competition,
      stats: {
        teams: teamCount,
        judges: judgeCount,
        scores: scoreCount
      }
    });
  } catch (error) {
    console.error('Get competition by ID error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid competition ID format' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
};

// Update Competition
const updateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, level, place, year, startDate, endDate, description, status, ageGroups, competitionTypes } = req.body;

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Validate competition types if provided
    if (competitionTypes !== undefined) {
      if (!Array.isArray(competitionTypes)) {
        return res.status(400).json({ 
          message: 'competitionTypes must be an array' 
        });
      }
      
      if (competitionTypes.length === 0) {
        return res.status(400).json({ 
          message: 'At least one competition type must be selected' 
        });
      }

      const validTypes = ['competition_1', 'competition_2', 'competition_3'];
      for (const type of competitionTypes) {
        if (!validTypes.includes(type)) {
          return res.status(400).json({ 
            message: `Invalid competition type: ${type}. Must be one of: ${validTypes.join(', ')}` 
          });
        }
      }
    }

    // Validate age groups if provided
    if (ageGroups !== undefined) {
      if (!Array.isArray(ageGroups)) {
        return res.status(400).json({ 
          message: 'ageGroups must be an array' 
        });
      }
      
      const validAgeGroups = ['Under8', 'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'];
      const validGenders = ['Male', 'Female'];
      
      for (const ag of ageGroups) {
        if (!validGenders.includes(ag.gender)) {
          return res.status(400).json({ 
            message: `Invalid gender: ${ag.gender}. Must be Male or Female` 
          });
        }
        if (!validAgeGroups.includes(ag.ageGroup)) {
          return res.status(400).json({ 
            message: `Invalid age group: ${ag.ageGroup}. Must be one of: ${validAgeGroups.join(', ')}` 
          });
        }
      }
    }

    // Update fields if provided
    if (name !== undefined) competition.name = name;
    if (level !== undefined) competition.level = level;
    if (place !== undefined) competition.place = place;
    if (year !== undefined) competition.year = year;
    if (startDate !== undefined) competition.startDate = new Date(startDate);
    if (endDate !== undefined) competition.endDate = new Date(endDate);
    if (description !== undefined) competition.description = description;
    if (ageGroups !== undefined) competition.ageGroups = ageGroups;
    if (competitionTypes !== undefined) competition.competitionTypes = [...new Set(competitionTypes)];
    
    // Handle status update with validation
    if (status !== undefined) {
      try {
        await competition.updateCompetitionStatus(status);
      } catch (statusError) {
        return res.status(400).json({ 
          message: statusError.message 
        });
      }
    } else {
      await competition.save();
    }

    // Populate admin details for response
    await competition.populate('admins', 'name email');

    res.json({
      message: 'Competition updated successfully',
      competition
    });
  } catch (error) {
    console.error('Update competition error:', error);
    
    // Handle duplicate name error
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: 'A competition with this name already exists' 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: 'Validation error',
        errors: messages 
      });
    }
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid competition ID format' });
    }
    
    res.status(500).json({ message: 'Server error during competition update' });
  }
};

// Delete Competition
const deleteCompetition = async (req, res) => {
  try {
    const { id } = req.params;

    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Check for related entities
    const [teamCount, judgeCount, scoreCount] = await Promise.all([
      Team.countDocuments({ competition: id }),
      Judge.countDocuments({ competition: id }),
      Score.countDocuments({ competition: id })
    ]);

    const hasRelatedData = teamCount > 0 || judgeCount > 0 || scoreCount > 0;

    if (hasRelatedData) {
      // Log attempted deletion with related data
      logCompetitionDeletion(id, competition.name, req.user._id, true);
      return res.status(409).json({ 
        message: 'Cannot delete competition with related data',
        relatedData: {
          teams: teamCount,
          judges: judgeCount,
          scores: scoreCount
        }
      });
    }

    // Remove competition from all admins
    await Admin.updateMany(
      { competitions: id },
      { $pull: { competitions: id } }
    );

    // Log successful deletion
    logCompetitionDeletion(id, competition.name, req.user._id, false);

    // Delete competition
    await Competition.findByIdAndDelete(id);

    res.json({
      message: 'Competition deleted successfully',
      competitionId: id
    });
  } catch (error) {
    console.error('Delete competition error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid competition ID format' });
    }
    
    res.status(500).json({ message: 'Server error during competition deletion' });
  }
};

// Assign Admin to Competition
const assignAdminToCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({ message: 'Admin ID is required' });
    }

    // Validate competition exists
    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Validate admin exists
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if admin is already assigned
    if (competition.admins.some(a => a.toString() === adminId)) {
      return res.status(400).json({ message: 'Admin is already assigned to this competition' });
    }

    // Add admin to competition
    await competition.addAdmin(adminId);

    // Add competition to admin's competitions array
    if (!admin.competitions.some(c => c.toString() === id)) {
      admin.competitions.push(id);
      await admin.save();
    }

    // Record assignment change to invalidate existing tokens
    recordAdminAssignmentChange(adminId);

    // Log the admin assignment change
    logAdminAssignmentChange(adminId, id, 'ASSIGNED', req.user._id);

    // Populate admin details for response
    await competition.populate('admins', 'name email');

    res.json({
      message: 'Admin assigned to competition successfully',
      competition,
      notice: 'Admin will need to re-authenticate to access this competition'
    });
  } catch (error) {
    console.error('Assign admin to competition error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    
    res.status(500).json({ message: 'Server error during admin assignment' });
  }
};

// Remove Admin from Competition
const removeAdminFromCompetition = async (req, res) => {
  try {
    const { id, adminId } = req.params;

    // Validate competition exists
    const competition = await Competition.findById(id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Check if admin is assigned
    if (!competition.admins.some(a => a.toString() === adminId)) {
      return res.status(400).json({ message: 'Admin is not assigned to this competition' });
    }

    // Prevent removing the last admin
    if (competition.admins.length === 1) {
      return res.status(400).json({ 
        message: 'Cannot remove the last admin from competition. At least one admin must be assigned.' 
      });
    }

    // Remove admin from competition
    await competition.removeAdmin(adminId);

    // Remove competition from admin's competitions array
    await Admin.findByIdAndUpdate(
      adminId,
      { $pull: { competitions: id } }
    );

    // Record assignment change to invalidate existing tokens
    recordAdminAssignmentChange(adminId);

    // Log the admin assignment removal
    logAdminAssignmentChange(adminId, id, 'REMOVED', req.user._id);

    // Populate admin details for response
    await competition.populate('admins', 'name email');

    res.json({
      message: 'Admin removed from competition successfully',
      competition,
      notice: 'Admin tokens for this competition have been invalidated'
    });
  } catch (error) {
    console.error('Remove admin from competition error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    
    res.status(500).json({ message: 'Server error during admin removal' });
  }
};

// Get Super Admin Dashboard Stats
// System stats are always aggregated across all competitions
// Competition stats can be filtered by competitionId query parameter
const getSuperAdminDashboard = async (req, res) => {
  try {
    const competitionId = req.query.competitionId;

    // If competitionId is provided, get competition-specific stats (same as admin dashboard)
    if (competitionId) {
      const competition = await Competition.findById(competitionId);
      if (!competition) {
        return res.status(404).json({ message: 'Competition not found' });
      }

      // Get teams with completed payment for this competition
      const competitionTeams = await CompetitionTeam.find({
        competition: competitionId,
        isActive: true,
        paymentStatus: 'completed'
      })
        .populate('team', 'name description')
        .populate('coach', 'name email')
        .populate('players.player', 'firstName lastName gender dateOfBirth')
        .populate('competition', 'name level place');

      let totalTeams = 0;
      let totalParticipants = 0;
      let totalBoys = 0;
      let totalGirls = 0;
      let boysTeams = 0;
      let girlsTeams = 0;

      competitionTeams.forEach(ct => {
        const teamPlayers = ct.players || [];
        const boys = teamPlayers.filter(p => p.gender === 'Male').length;
        const girls = teamPlayers.filter(p => p.gender === 'Female').length;

        totalParticipants += teamPlayers.length;
        totalBoys += boys;
        totalGirls += girls;
        if (boys > girls) boysTeams++;
        else if (girls > boys) girlsTeams++;
        totalTeams += 1;
      });

      return res.json({
        competitionStats: {
          totalTeams,
          totalParticipants,
          totalBoys,
          totalGirls,
          boysTeams,
          girlsTeams
        },
        selectedCompetition: {
          id: competition._id,
          name: competition.name,
          level: competition.level,
          place: competition.place
        }
      });
    }

    // No competition selected - get aggregated stats across all competitions
    const allCompetitionTeams = await CompetitionTeam.find({
      isActive: true,
      paymentStatus: 'completed'
    })
      .populate('players.player', 'gender');

    let totalTeams = 0;
    let totalParticipants = 0;
    let totalBoys = 0;
    let totalGirls = 0;
    let boysTeams = 0;
    let girlsTeams = 0;

    allCompetitionTeams.forEach(ct => {
      const teamPlayers = ct.players || [];
      const boys = teamPlayers.filter(p => p.gender === 'Male').length;
      const girls = teamPlayers.filter(p => p.gender === 'Female').length;

      totalParticipants += teamPlayers.length;
      totalBoys += boys;
      totalGirls += girls;
      if (boys > girls) boysTeams++;
      else if (girls > boys) girlsTeams++;
      totalTeams += 1;
    });

    const [totalCompetitions, activeCompetitions] = await Promise.all([
      Competition.countDocuments({ isDeleted: false }),
      Competition.countDocuments({ status: { $in: ['upcoming', 'ongoing'] }, isDeleted: false })
    ]);

    res.json({
      competitionStats: {
        totalTeams,
        totalParticipants,
        totalBoys,
        totalGirls,
        boysTeams,
        girlsTeams,
        totalCompetitions,
        activeCompetitions
      }
    });
  } catch (error) {
    console.error('Get super admin dashboard error:', error);
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
  getSuperAdminDashboard,
  getAllCoaches,
  updateCoachStatus,
  getAllTeamsForSuperAdmin,
  deleteTeam,
  deleteJudge,
  
  // Competition management functions
  createCompetition,
  getAllCompetitions,
  getCompetitionById,
  updateCompetition,
  deleteCompetition,
  assignAdminToCompetition,
  removeAdminFromCompetition,
  
  // Inherited admin functions
  ...adminController
};
