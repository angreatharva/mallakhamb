const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Competition = require('../models/Competition');
const CompetitionTeam = require('../models/CompetitionTeam');
const { generateToken } = require('../utils/tokenUtils');

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
      message: 'Coach registered successfully. Please create your team.',
      token,
      coach: {
        id: coach._id,
        name: coach.name,
        email: coach.email,
        hasTeam: false
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

// Get coach registration status (what step they're on)
const getCoachStatus = async (req, res) => {
  try {
    // Check if coach has a team
    const team = await Team.findOne({ coach: req.user._id });
    
    if (!team) {
      return res.json({
        step: 'create-team',
        message: 'Please create your team first',
        hasTeam: false,
        hasCompetition: false,
        canAddPlayers: false
      });
    }

    // Check if team has competition
    if (!team.competition) {
      return res.json({
        step: 'select-competition',
        message: 'Please select a competition for your team',
        hasTeam: true,
        hasCompetition: false,
        canAddPlayers: false,
        team: {
          id: team._id,
          name: team.name,
          description: team.description
        }
      });
    }

    // Team has competition, can add players
    await team.populate('competition', 'name level place startDate endDate status');
    
    return res.json({
      step: 'add-players',
      message: 'You can now add players to your team',
      hasTeam: true,
      hasCompetition: true,
      canAddPlayers: true,
      team: {
        id: team._id,
        name: team.name,
        description: team.description,
        competition: team.competition,
        isSubmitted: team.isSubmitted,
        playerCount: team.players.length
      }
    });
  } catch (error) {
    console.error('Get coach status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create team (without competition context initially)
const createTeam = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if team name already exists for this coach
    const existingTeam = await Team.findOne({ 
      name,
      coach: req.user._id
    });
    
    if (existingTeam) {
      return res.status(400).json({ message: 'You already have a team with this name' });
    }

    // Create new team without competition (will be added later)
    const team = new Team({
      name,
      coach: req.user._id,
      description,
      competition: null // Will be set when registering for a competition
    });

    await team.save();

    res.status(201).json({
      message: 'Team created successfully. You can now register it for competitions.',
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

// Get all teams for the coach
const getCoachTeams = async (req, res) => {
  try {
    const teams = await Team.find({ coach: req.user._id })
      .select('name description isActive');

    // Get competition registrations for each team
    const teamsWithCompetitions = await Promise.all(
      teams.map(async (team) => {
        const registrations = await CompetitionTeam.find({ team: team._id })
          .populate('competition', 'name level place startDate endDate status')
          .select('competition isSubmitted paymentStatus players');
        
        return {
          id: team._id,
          name: team.name,
          description: team.description,
          isActive: team.isActive,
          competitions: registrations.map(reg => ({
            competition: reg.competition,
            isSubmitted: reg.isSubmitted,
            paymentStatus: reg.paymentStatus,
            playerCount: reg.players.length
          }))
        };
      })
    );

    res.json({ teams: teamsWithCompetitions });
  } catch (error) {
    console.error('Get coach teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all open competitions (upcoming and ongoing)
const getOpenCompetitions = async (req, res) => {
  try {
    const openCompetitions = await Competition.find({
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false
    })
      .select('name level place startDate endDate status description')
      .sort({ startDate: 1 });

    res.json({ 
      competitions: openCompetitions.map(comp => ({
        id: comp._id,
        name: comp.name,
        level: comp.level,
        place: comp.place,
        startDate: comp.startDate,
        endDate: comp.endDate,
        status: comp.status,
        description: comp.description
      }))
    });
  } catch (error) {
    console.error('Get open competitions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Register team for a specific competition
const registerTeamForCompetition = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { competitionId } = req.body;

    // Validate team exists and belongs to coach
    const team = await Team.findOne({ 
      _id: teamId,
      coach: req.user._id
    });

    if (!team) {
      return res.status(404).json({ message: 'Team not found or does not belong to you' });
    }

    // Check if team is already registered for this specific competition using CompetitionTeam
    const existingRegistration = await CompetitionTeam.findOne({
      team: teamId,
      competition: competitionId
    });

    if (existingRegistration) {
      // Team is already registered for this competition - just return success
      // This allows the flow to continue to dashboard
      await existingRegistration.populate([
        { path: 'team', select: 'name description' },
        { path: 'competition', select: 'name level place startDate endDate status' }
      ]);

      return res.json({
        message: 'Team is already registered for this competition',
        competitionTeam: {
          id: existingRegistration._id,
          team: existingRegistration.team,
          competition: existingRegistration.competition,
          players: existingRegistration.players
        }
      });
    }

    // Validate competition exists and is open
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (competition.isDeleted) {
      return res.status(403).json({ message: 'This competition has been deleted' });
    }

    if (competition.status === 'completed') {
      return res.status(403).json({ 
        message: 'Cannot register for a completed competition' 
      });
    }

    // Create competition team registration
    const competitionTeam = new CompetitionTeam({
      team: teamId,
      competition: competitionId,
      coach: req.user._id,
      players: [], // Empty initially, coach will add players later
      isSubmitted: false,
      paymentStatus: 'pending'
    });

    await competitionTeam.save();

    // Add to competition's teams array if not already there
    if (!competition.teams) {
      competition.teams = [];
    }
    if (!competition.teams.includes(competitionTeam._id)) {
      competition.teams.push(competitionTeam._id);
      await competition.save();
    }

    await competitionTeam.populate([
      { path: 'team', select: 'name description' },
      { path: 'competition', select: 'name level place startDate endDate status' }
    ]);

    res.json({
      message: 'Team registered for competition successfully. You can now add players.',
      competitionTeam: {
        id: competitionTeam._id,
        team: competitionTeam.team,
        competition: competitionTeam.competition,
        players: competitionTeam.players
      }
    });
  } catch (error) {
    console.error('Register team for competition error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Select competition for coach's team (simplified version)
const selectCompetitionForTeam = async (req, res) => {
  try {
    const { competitionId } = req.body;

    // Find coach's team without competition
    const team = await Team.findOne({ 
      coach: req.user._id,
      competition: null
    });

    if (!team) {
      // Check if coach already has a team for this competition
      const existingTeam = await Team.findOne({
        coach: req.user._id,
        competition: competitionId
      });

      if (existingTeam) {
        return res.json({
          message: 'Team already registered for this competition',
          team: {
            id: existingTeam._id,
            name: existingTeam.name,
            description: existingTeam.description,
            competition: competitionId
          }
        });
      }

      return res.status(404).json({ message: 'No team found. Please create a team first.' });
    }

    // Validate competition exists and is open
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (competition.isDeleted) {
      return res.status(403).json({ message: 'This competition has been deleted' });
    }

    if (competition.status === 'completed') {
      return res.status(403).json({ 
        message: 'Cannot register for a completed competition' 
      });
    }

    // Check if team name already exists in this competition
    const duplicateTeam = await Team.findOne({ 
      name: team.name,
      competition: competitionId,
      _id: { $ne: team._id }
    });
    
    if (duplicateTeam) {
      // Auto-rename the team to make it unique
      team.name = `${team.name} (${Date.now()})`;
    }

    // Register team for competition
    team.competition = competitionId;
    await team.save();

    await team.populate('competition', 'name level place startDate endDate status');

    res.json({
      message: 'Competition selected successfully. You can now add players.',
      team: {
        id: team._id,
        name: team.name,
        description: team.description,
        competition: team.competition
      }
    });
  } catch (error) {
    console.error('Select competition error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team dashboard
const getTeamDashboard = async (req, res) => {
  try {
    // Find competition team registration for current competition
    const competitionTeam = await CompetitionTeam.findOne({ 
      coach: req.user._id,
      competition: req.competitionId 
    })
      .populate('players.player', 'firstName lastName email dateOfBirth gender')
      .populate('coach', 'name email')
      .populate('team', 'name description')
      .populate('competition', 'name level place startDate endDate status');

    if (!competitionTeam) {
      // Return empty state instead of 404 to allow coaches to register teams
      return res.status(200).json({ 
        team: null,
        message: 'No team registered for this competition. Please register a team to get started.'
      });
    }

    // Format response to match frontend expectations
    res.json({ 
      team: {
        _id: competitionTeam.team._id,
        name: competitionTeam.team.name,
        description: competitionTeam.team.description,
        competition: competitionTeam.competition,
        coach: competitionTeam.coach,
        isActive: competitionTeam.isActive,
        isSubmitted: competitionTeam.isSubmitted,
        paymentStatus: competitionTeam.paymentStatus,
        players: competitionTeam.players,
        createdAt: competitionTeam.createdAt,
        updatedAt: competitionTeam.updatedAt,
        __v: competitionTeam.__v
      }
    });
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

    // Search all players by name or email (not just those from coach's team)
    const players = await Player.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
      .populate('team', 'name competition')
      .select('firstName lastName email dateOfBirth gender team ageGroup');

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

    // Find competition team for current competition
    const competitionTeam = await CompetitionTeam.findOne({ 
      coach: req.user._id,
      competition: req.competitionId 
    });
    
    if (!competitionTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Check if player exists
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Add player to competition team with age group
    await competitionTeam.addPlayer(playerId, ageGroup, gender);

    res.json({ message: 'Player added to team successfully' });
  } catch (error) {
    console.error('Add player to age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Remove player from age group
const removePlayerFromAgeGroup = async (req, res) => {
  try {
    const { playerId } = req.params;

    // Find competition team for current competition
    const competitionTeam = await CompetitionTeam.findOne({ 
      coach: req.user._id,
      competition: req.competitionId 
    });
    
    if (!competitionTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Remove player from competition team
    await competitionTeam.removePlayer(playerId);

    res.json({ message: 'Player removed from team successfully' });
  } catch (error) {
    console.error('Remove player from age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit team for competition
const submitTeam = async (req, res) => {
  try {
    // Find competition team for current competition
    const competitionTeam = await CompetitionTeam.findOne({ 
      coach: req.user._id,
      competition: req.competitionId 
    }).populate('team', 'name');
    
    if (!competitionTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Check if team has players
    if (!competitionTeam.players || competitionTeam.players.length === 0) {
      return res.status(400).json({ message: 'Cannot submit team without players' });
    }

    // Check if team is already submitted
    if (competitionTeam.isSubmitted) {
      return res.status(400).json({ message: 'Team has already been submitted' });
    }

    // Calculate payment amount
    const baseAmount = 500; // Base registration fee
    const perPlayerAmount = 100; // Per player fee
    const totalAmount = baseAmount + (competitionTeam.players.length * perPlayerAmount);

    // Update competition team submission status
    competitionTeam.isSubmitted = true;
    competitionTeam.submittedAt = new Date();
    competitionTeam.paymentStatus = 'completed'; // Simulating successful payment
    competitionTeam.paymentAmount = totalAmount;

    await competitionTeam.save();

    res.json({ 
      message: 'Team submitted successfully',
      submissionDetails: {
        teamName: competitionTeam.team.name,
        playerCount: competitionTeam.players.length,
        paymentAmount: totalAmount,
        submittedAt: competitionTeam.submittedAt
      }
    });
  } catch (error) {
    console.error('Submit team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team status for current competition
const getTeamStatus = async (req, res) => {
  try {
    // Check if coach has a team for the current competition
    const team = await Team.findOne({ 
      coach: req.user._id,
      competition: req.competitionId 
    })
      .populate('competition', 'name level place startDate endDate status')
      .populate('players.player', 'firstName lastName email');

    if (!team) {
      return res.json({ 
        hasTeam: false, 
        team: null 
      });
    }

    res.json({ 
      hasTeam: true, 
      team: {
        id: team._id,
        name: team.name,
        description: team.description,
        isSubmitted: team.isSubmitted,
        paymentStatus: team.paymentStatus,
        playerCount: team.players.length,
        competition: team.competition
      }
    });
  } catch (error) {
    console.error('Get team status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerCoach,
  loginCoach,
  getCoachProfile,
  getCoachStatus,
  createTeam,
  getCoachTeams,
  getOpenCompetitions,
  registerTeamForCompetition,
  selectCompetitionForTeam,
  getTeamDashboard,
  searchPlayers,
  addPlayerToAgeGroup,
  removePlayerFromAgeGroup,
  submitTeam,
  getTeamStatus
};
