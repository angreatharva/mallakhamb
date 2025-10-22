const Player = require('../models/Player');
const Team = require('../models/Team');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '7d' }
  );
};

// Register a new player
const registerPlayer = async (req, res) => {
  try {
    const { firstName, lastName, aadharNumber, dateOfBirth, password, gender } = req.body;

    // Check if player already exists
    const existingPlayer = await Player.findOne({ aadharNumber });
    if (existingPlayer) {
      return res.status(400).json({ message: 'Player with this Aadhar number already exists' });
    }

    // Create new player
    const player = new Player({
      firstName,
      lastName,
      aadharNumber,
      dateOfBirth,
      password,
      gender
    });

    await player.save();

    // Generate token
    const token = generateToken(player._id, 'player');

    res.status(201).json({
      message: 'Player registered successfully',
      token,
      player: {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        aadharNumber: player.aadharNumber,
        team: player.team
      }
    });
  } catch (error) {
    console.error('Player registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login player
const loginPlayer = async (req, res) => {
  try {
    const { aadharNumber, password } = req.body;

    // Find player by Aadhar number
    const player = await Player.findOne({ aadharNumber });
    if (!player) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await player.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(player._id, 'player');

    res.json({
      message: 'Login successful',
      token,
      player: {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        aadharNumber: player.aadharNumber,
        team: player.team,
        ageGroup: player.ageGroup
      }
    });
  } catch (error) {
    console.error('Player login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get player profile
const getPlayerProfile = async (req, res) => {
  try {
    const player = await Player.findById(req.user._id)
      .populate('team', 'name')
      .select('-password');

    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    res.json({ player });
  } catch (error) {
    console.error('Get player profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update player team
const updatePlayerTeam = async (req, res) => {
  try {
    const { teamId } = req.body;

    const player = await Player.findById(req.user._id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Check if team exists
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    player.team = teamId;
    await player.save();

    res.json({ message: 'Team updated successfully', team: team.name });
  } catch (error) {
    console.error('Update player team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams for player selection
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true }).select('name');
    res.json({ teams });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerPlayer,
  loginPlayer,
  getPlayerProfile,
  updatePlayerTeam,
  getTeams
};
