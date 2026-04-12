/**
 * Player Controller (Refactored)
 * 
 * Handles player HTTP endpoints by delegating to PlayerService and AuthenticationService.
 * Uses asyncHandler for error handling and validation middleware.
 * Maintains 100% backward compatibility with existing API contracts.
 * 
 * This controller handles:
 * - Player registration and login
 * - Player profile management
 * - Team assignment and management
 * - Available teams listing
 * 
 * Requirements: 1.2, 1.5, 19.1, 19.2
 */

const { asyncHandler } = require('../src/middleware/error.middleware');
const container = require('../src/infrastructure/di-container');

/**
 * Register a new player
 * 
 * @route POST /api/players/register
 * @access Public
 */
const registerPlayer = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { firstName, lastName, email, dateOfBirth, password, gender } = req.body;

  const result = await authService.register(
    { firstName, lastName, email, dateOfBirth, password, gender },
    'player'
  );

  res.status(201).json({
    message: 'Player registered successfully',
    token: result.token,
    player: {
      id: result.user._id,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      team: result.user.team
    }
  });
});

/**
 * Login player
 * 
 * @route POST /api/players/login
 * @access Public
 */
const loginPlayer = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const tokenService = container.resolve('tokenService');
  const { email, password } = req.body;

  const result = await authService.login(email, password, 'player');

  // Get competition context from player's team if available
  let competitionId = null;
  if (result.user.team && result.user.team.competition) {
    competitionId = result.user.team.competition.toString();
  }

  // Generate token with competition context if available
  const token = competitionId 
    ? tokenService.generateToken(result.user._id.toString(), 'player', competitionId)
    : result.token;

  res.json({
    message: 'Login successful',
    token,
    player: {
      id: result.user._id,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      team: result.user.team?._id || result.user.team,
      ageGroup: result.user.ageGroup
    }
  });
});

/**
 * Get player profile
 * 
 * @route GET /api/players/profile
 * @access Protected (requires authentication)
 */
const getPlayerProfile = asyncHandler(async (req, res) => {
  const playerService = container.resolve('playerService');
  const playerId = req.user._id.toString();

  const player = await playerService.getProfile(playerId);

  res.json({ player });
});

/**
 * Get player's team for current competition
 * 
 * @route GET /api/players/team
 * @access Protected (requires authentication and competition context)
 */
const getPlayerTeam = asyncHandler(async (req, res) => {
  const playerService = container.resolve('playerService');
  const competitionRepository = container.resolve('competitionRepository');
  const playerId = req.user._id.toString();
  const competitionId = req.competitionId;

  // Get player profile
  const player = await playerService.getProfile(playerId);

  let team = null;
  let ageGroup = null;
  let teamStatus = 'Not assigned';

  // If player has a team, check if it's registered in the current competition
  if (player.team) {
    const competition = await competitionRepository.findById(competitionId, {
      populate: 'registeredTeams.coach'
    });

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
          p => p.player && p.player.toString() === playerId
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
      dateOfBirth: player.dateOfBirth,
      ageGroup: ageGroup || null,
      gender: player.gender
    },
    team,
    teamStatus
  });
});

/**
 * Join a team
 * Player joins a team in a specific competition
 * 
 * @route POST /api/players/team/join
 * @access Protected (requires authentication)
 */
const joinTeam = asyncHandler(async (req, res) => {
  const playerService = container.resolve('playerService');
  const competitionRepository = container.resolve('competitionRepository');
  const tokenService = container.resolve('tokenService');
  const { teamId, competitionId } = req.body;
  const playerId = req.user._id.toString();

  // Validate competition exists
  const competition = await competitionRepository.findById(competitionId, {
    populate: 'registeredTeams.team'
  });

  if (!competition) {
    return res.status(404).json({ message: 'Competition not found' });
  }

  // Validate team is registered in competition
  const registeredTeam = competition.registeredTeams.find(
    rt => rt.team && rt.team._id && rt.team._id.toString() === teamId && rt.isActive
  );

  if (!registeredTeam || !registeredTeam.team || !registeredTeam.team.isActive) {
    return res.status(404).json({
      message: 'Team not found or not registered for this competition'
    });
  }

  // Assign player to team
  await playerService.assignToTeam(playerId, teamId);

  // Generate new token with competition context
  const token = tokenService.generateToken(playerId, 'player', competitionId);

  res.json({
    message: 'Successfully joined team',
    token,
    team: {
      id: registeredTeam.team._id,
      name: registeredTeam.team.name
    }
  });
});

/**
 * Get available teams for player to join
 * Returns teams from open competitions
 * 
 * @route GET /api/players/teams
 * @access Protected (requires authentication)
 */
const getAvailableTeams = asyncHandler(async (req, res) => {
  const competitionRepository = container.resolve('competitionRepository');
  const competitionId = req.competitionId || req.query.competitionId;

  if (competitionId) {
    // Filter by specific competition
    const competition = await competitionRepository.findById(competitionId, {
      populate: [
        { path: 'registeredTeams.team', select: 'name description isActive' },
        { path: 'registeredTeams.coach', select: 'firstName lastName' }
      ]
    });

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

  // No competition selected: return teams from open competitions
  const openCompetitions = await competitionRepository.find(
    {
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false
    },
    {
      populate: [
        { path: 'registeredTeams.team', select: 'name description isActive' },
        { path: 'registeredTeams.coach', select: 'firstName lastName' }
      ],
      select: '_id name registeredTeams status'
    }
  );

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
});

module.exports = {
  registerPlayer,
  loginPlayer,
  getPlayerProfile,
  getPlayerTeam,
  joinTeam,
  getAvailableTeams
};
