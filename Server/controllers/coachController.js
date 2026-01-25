const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Player = require('../models/Player');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '7d' }
  );
};

// Register a new coach
const registerCoach = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if coach already exists
    const existingCoach = await Coach.findOne({ email });
    if (existingCoach) {
      return res.status(400).json({ message: 'Coach with this email already exists' });
    }

    // Create new coach
    const coach = new Coach({
      name,
      email,
      password
    });

    await coach.save();

    // Generate token
    const token = generateToken(coach._id, 'coach');

    res.status(201).json({
      message: 'Coach registered successfully',
      token,
      coach: {
        id: coach._id,
        name: coach.name,
        email: coach.email,
        team: coach.team
      }
    });
  } catch (error) {
    console.error('Coach registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login coach
const loginCoach = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find coach by email
    const coach = await Coach.findOne({ email });
    if (!coach) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await coach.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(coach._id, 'coach');

    res.json({
      message: 'Login successful',
      token,
      coach: {
        id: coach._id,
        name: coach.name,
        email: coach.email,
        team: coach.team
      }
    });
  } catch (error) {
    console.error('Coach login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get coach profile
const getCoachProfile = async (req, res) => {
  try {
    const coach = await Coach.findById(req.user._id)
      .populate('team')
      .select('-password');

    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    res.json({ coach });
  } catch (error) {
    console.error('Get coach profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create team
const createTeam = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if coach already has a team
    const coach = await Coach.findById(req.user._id);
    if (coach.team) {
      return res.status(400).json({ message: 'Coach already has a team' });
    }

    // Check if team name already exists
    const existingTeam = await Team.findOne({ name });
    if (existingTeam) {
      return res.status(400).json({ message: 'Team name already exists' });
    }

    // Create new team
    const team = new Team({
      name,
      coach: req.user._id,
      description
    });

    await team.save();

    // Update coach with team reference
    coach.team = team._id;
    await coach.save();

    res.status(201).json({
      message: 'Team created successfully',
      team: {
        id: team._id,
        name: team.name,
        description: team.description
      }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team dashboard
const getTeamDashboard = async (req, res) => {
  try {
    const coach = await Coach.findById(req.user._id).populate('team');
    
    if (!coach.team) {
      return res.status(404).json({ message: 'No team found for this coach' });
    }

    const team = await Team.findById(coach.team._id)
      .populate('players.player', 'firstName lastName email dateOfBirth gender')
      .populate('coach', 'name email');

    res.json({ team });
  } catch (error) {
    console.error('Get team dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Search players for team assignment
const searchPlayers = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ players: [] });
    }

    const players = await Player.find({
      $and: [
        { team: req.user.team }, // Only players from coach's team
        {
          $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).select('firstName lastName email dateOfBirth gender');

    res.json({ players });
  } catch (error) {
    console.error('Search players error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add player to age group
const addPlayerToAgeGroup = async (req, res) => {
  try {
    const { playerId, ageGroup, gender } = req.body;

    const team = await Team.findById(req.user.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if player exists and belongs to the team
    const player = await Player.findOne({ _id: playerId, team: req.user.team });
    if (!player) {
      return res.status(404).json({ message: 'Player not found in your team' });
    }

    // Add player to team with age group
    await team.addPlayer(playerId, ageGroup, gender);

    // Update player's age group in their profile
    player.ageGroup = ageGroup;
    await player.save();

    res.json({ message: 'Player added to age group successfully' });
  } catch (error) {
    console.error('Add player to age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Remove player from age group
const removePlayerFromAgeGroup = async (req, res) => {
  try {
    const { playerId } = req.params;

    const team = await Team.findById(req.user.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Remove player from team
    await team.removePlayer(playerId);

    // Clear player's age group in their profile
    const player = await Player.findById(playerId);
    if (player) {
      player.ageGroup = null;
      await player.save();
    }

    res.json({ message: 'Player removed from age group successfully' });
  } catch (error) {
    console.error('Remove player from age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit team for competition
const submitTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.user.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if team has players
    if (!team.players || team.players.length === 0) {
      return res.status(400).json({ message: 'Cannot submit team without players' });
    }

    // Check if team is already submitted
    if (team.isSubmitted) {
      return res.status(400).json({ message: 'Team has already been submitted' });
    }

    // Calculate payment amount
    const baseAmount = 500; // Base registration fee
    const perPlayerAmount = 100; // Per player fee
    const totalAmount = baseAmount + (team.players.length * perPlayerAmount);

    // Update team submission status
    team.isSubmitted = true;
    team.submittedAt = new Date();
    team.paymentStatus = 'completed'; // Simulating successful payment
    team.paymentAmount = totalAmount;

    await team.save();

    res.json({ 
      message: 'Team submitted successfully',
      submissionDetails: {
        teamName: team.name,
        playerCount: team.players.length,
        paymentAmount: totalAmount,
        submittedAt: team.submittedAt
      }
    });
  } catch (error) {
    console.error('Submit team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerCoach,
  loginCoach,
  getCoachProfile,
  createTeam,
  getTeamDashboard,
  searchPlayers,
  addPlayerToAgeGroup,
  removePlayerFromAgeGroup,
  submitTeam
};
