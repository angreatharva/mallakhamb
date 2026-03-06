const Player = require('../models/Player');
const Team = require('../models/Team');
const Competition = require('../models/Competition');
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

    // Find player by email and populate team to get competition
    const player = await Player.findOne({ email }).populate('team', 'competition');
    if (!player) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await player.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Get competition context from player's team
    let competitionId = null;
    if (player.team && player.team.competition) {
      competitionId = player.team.competition.toString();
    }

    // Generate token with competition context if available
    const token = generateToken(player._id, 'player', competitionId);

    res.json({
      message: 'Login successful',
      token,
      player: {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        team: player.team?._id || player.team,
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
    let ageGroup = null;
    let teamStatus = 'Not assigned';
    
    // If player has a team, check if it's registered in the current competition
    if (player.team) {
      const competition = await Competition.findById(req.competitionId)
        .populate('registeredTeams.coach', 'firstName lastName email');
      
      if (competition) {
        const registeredTeam = competition.registeredTeams.find(
          rt => rt.team && rt.team._id && rt.team._id.toString() === player.team._id.toString() && rt.isActive
        );
        
        if (registeredTeam) {
          team = {
            _id: player.team._id,
            name: player.team.name,
            description: player.team.description,
            coach: registeredTeam.coach
          };

          // Find player's age group in this competition
          const playerEntry = registeredTeam.players.find(
            p => p.player && p.player.toString() === player._id.toString()
          );
          
          if (playerEntry) {
            ageGroup = playerEntry.ageGroup;
            teamStatus = registeredTeam.isSubmitted ? 'Submitted' : 'Active';
          } else {
            teamStatus = 'Not assigned to age group';
          }
        } else {
          teamStatus = 'Team not registered in competition';
        }
      }
    }

    res.json({ 
      player: {
        id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        ageGroup: ageGroup || null,
        gender: player.gender
      },
      team,
      teamStatus
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

    const competition = await Competition.findById(competitionId)
      .populate('registeredTeams.team');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.team && rt.team._id && rt.team._id.toString() === teamId && rt.isActive
    );

    if (!registeredTeam || !registeredTeam.team || !registeredTeam.team.isActive) {
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
        id: registeredTeam.team._id,
        name: registeredTeam.team.name
      }
    });
  } catch (error) {
    console.error('Join team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams available for player to join (no competition required)
// Returns distinct teams from all open competitions
const getAvailableTeams = async (req, res) => {
  try {
    const competitionId = req.competitionId || req.query.competitionId;

    if (competitionId) {
      // Optional: filter by one competition (e.g. when competition was already selected)
      const competition = await Competition.findById(competitionId)
        .populate('registeredTeams.team', 'name description')
        .populate('registeredTeams.coach', 'firstName lastName');

      if (!competition) {
        return res.json({ teams: [] });
      }

      const teams = competition.registeredTeams
        .filter(rt => rt.isActive && rt.team && rt.team.isActive)
        .map(rt => ({
          _id: rt.team._id,
          name: rt.team.name,
          description: rt.team.description,
          coach: rt.coach,
          competitionId: competition._id,
          competitionName: competition.name
        }));

      return res.json({ teams });
    }

    // No competition selected: return distinct teams from open competitions
    const openCompetitions = await Competition.find({
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false
    })
      .populate('registeredTeams.team', 'name description')
      .populate('registeredTeams.coach', 'firstName lastName')
      .select('_id name registeredTeams');

    if (openCompetitions.length === 0) {
      return res.json({ teams: [] });
    }

    // Collect all unique teams from all open competitions
    const teamsMap = new Map();
    
    openCompetitions.forEach(comp => {
      comp.registeredTeams
        .filter(rt => rt.isActive && rt.team && rt.team.isActive)
        .forEach(rt => {
          const teamId = rt.team._id.toString();
          if (!teamsMap.has(teamId)) {
            teamsMap.set(teamId, {
              _id: rt.team._id,
              name: rt.team.name,
              description: rt.team.description,
              coach: rt.coach,
              competitionId: comp._id,
              competitionName: comp.name
            });
          }
        });
    });

    const teams = Array.from(teamsMap.values());

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
