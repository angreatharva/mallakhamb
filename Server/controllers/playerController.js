const Player = require('../models/Player');
const Team = require('../models/Team');
const { generateToken } = require('../utils/tokenUtils');

// Register a new player
const registerPlayer = async (req, res) => {
  try {
    const { firstName, lastName, email, dateOfBirth, password, gender } = req.body;

    // Check if player already exists
    const existingPlayer = await Player.findOne({ email });
    if (existingPlayer) {
      return res.status(400).json({ message: 'Player with this email already exists' });
    }

    // Create new player
    const player = new Player({
      firstName,
      lastName,
      email,
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
        email: player.email,
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
    const { email, password } = req.body;

    // Find player by email
    const player = await Player.findOne({ email });
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
        email: player.email,
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

// Get player's team for current competition
const getPlayerTeam = async (req, res) => {
  try {
    const player = await Player.findById(req.user._id)
      .populate({
        path: 'team',
        match: { competition: req.competitionId },
        populate: {
          path: 'coach',
          select: 'firstName lastName email'
        }
      })
      .select('-password');

    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // If player has a team but it doesn't match the current competition, return null
    const team = player.team && player.team.competition?.toString() === req.competitionId.toString() 
      ? player.team 
      : null;

    res.json({ 
      player: {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        ageGroup: player.ageGroup,
        gender: player.gender
      },
      team 
    });
  } catch (error) {
    console.error('Get player team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Join a team (validate team belongs to current competition)
const joinTeam = async (req, res) => {
  try {
    const { teamId } = req.body;

    const player = await Player.findById(req.user._id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Check if team exists and belongs to current competition
    const team = await Team.findOne({ 
      _id: teamId,
      competition: req.competitionId 
    });
    
    if (!team) {
      return res.status(404).json({ 
        message: 'Team not found in the current competition' 
      });
    }

    player.team = teamId;
    await player.save();

    res.json({ 
      message: 'Successfully joined team', 
      team: {
        id: team._id,
        name: team.name
      }
    });
  } catch (error) {
    console.error('Join team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams for player selection (filtered by current competition)
const getAvailableTeams = async (req, res) => {
  try {
    // Filter teams by current competition context
    const teams = await Team.find({ 
      isActive: true,
      competition: req.competitionId 
    })
    .populate('coach', 'firstName lastName')
    .select('name coach description');
    
    res.json({ teams });
  } catch (error) {
    console.error('Get available teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerPlayer,
  loginPlayer,
  getPlayerProfile,
  getPlayerTeam,
  joinTeam,
  getAvailableTeams
};
