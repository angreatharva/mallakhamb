const Player = require('../models/Player');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
const CompetitionTeam = require('../models/CompetitionTeam');
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
      .populate('team', 'name description')
      .select('-password');

    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    let team = null;
    
    // If player has a team, check if it's registered in the current competition
    if (player.team) {
      const competitionTeam = await CompetitionTeam.findOne({
        team: player.team._id,
        competition: req.competitionId,
        isActive: true
      }).populate({
        path: 'coach',
        select: 'firstName lastName email'
      });
      
      if (competitionTeam) {
        team = {
          _id: player.team._id,
          name: player.team.name,
          description: player.team.description,
          coach: competitionTeam.coach
        };
      }
    }

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

// Join a team (teamId + competitionId in body; returns new token with competition set)
const joinTeam = async (req, res) => {
  try {
    const { teamId, competitionId } = req.body;

    if (!teamId || !competitionId) {
      return res.status(400).json({
        message: 'Both teamId and competitionId are required'
      });
    }

    const player = await Player.findById(req.user._id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const competitionTeam = await CompetitionTeam.findOne({
      team: teamId,
      competition: competitionId,
      isActive: true
    }).populate('team');

    if (!competitionTeam || !competitionTeam.team || !competitionTeam.team.isActive) {
      return res.status(404).json({
        message: 'Team not found or not registered for this competition'
      });
    }

    player.team = teamId;
    await player.save();

    const token = generateToken(player._id, 'player', competitionId);

    res.json({
      message: 'Successfully joined team',
      token,
      team: {
        id: competitionTeam.team._id,
        name: competitionTeam.team.name
      }
    });
  } catch (error) {
    console.error('Join team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams available for player to join (no competition required)
// Returns teams from all open competitions so player can pick team first, then we set competition on join
const getAvailableTeams = async (req, res) => {
  try {
    const competitionId = req.competitionId || req.query.competitionId;

    if (competitionId) {
      // Optional: filter by one competition (e.g. when competition was already selected)
      const competitionTeams = await CompetitionTeam.find({
        competition: competitionId,
        isActive: true
      })
        .populate({
          path: 'team',
          match: { isActive: true },
          select: 'name description'
        })
        .populate('coach', 'firstName lastName')
        .populate('competition', 'name level place')
        .select('team coach competition');

      const teams = competitionTeams
        .filter(ct => ct.team)
        .map(ct => ({
          _id: ct.team._id,
          name: ct.team.name,
          description: ct.team.description,
          coach: ct.coach,
          competitionId: ct.competition?._id,
          competitionName: ct.competition?.name
        }));

      return res.json({ teams });
    }

    // No competition selected: return all joinable teams from open (upcoming/ongoing) competitions
    const openCompetitions = await Competition.find({
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false
    }).select('_id name');

    const openIds = openCompetitions.map(c => c._id);
    if (openIds.length === 0) {
      return res.json({ teams: [] });
    }

    const competitionTeams = await CompetitionTeam.find({
      competition: { $in: openIds },
      isActive: true
    })
      .populate({
        path: 'team',
        match: { isActive: true },
        select: 'name description'
      })
      .populate('coach', 'firstName lastName')
      .populate('competition', 'name level place')
      .select('team coach competition');

    const teams = competitionTeams
      .filter(ct => ct.team && ct.competition)
      .map(ct => ({
        _id: ct.team._id,
        name: ct.team.name,
        description: ct.team.description,
        coach: ct.coach,
        competitionId: ct.competition._id,
        competitionName: ct.competition.name
      }));

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
