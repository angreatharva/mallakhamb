/**
 * Coach Controller (Refactored)
 * 
 * Handles coach HTTP endpoints by delegating to CoachService, TeamService, CompetitionService, and AuthenticationService.
 * Uses asyncHandler for error handling and validation middleware.
 * Maintains 100% backward compatibility with existing API contracts.
 * 
 * Requirements: 1.2, 1.5, 19.1, 19.2
 */

const { asyncHandler } = require('../middleware/error.middleware');
const container = require('../infrastructure/di-container');
const { ValidationError, NotFoundError } = require('../errors');

/**
 * Register a new coach
 * 
 * @route POST /api/coach/register
 * @access Public
 */
const registerCoach = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { name, email, password } = req.body;

  // Validate password strength
  const { validatePassword } = require('../../utils/passwordValidation');
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.isValid) {
    throw new ValidationError('Password does not meet requirements', { errors: passwordCheck.errors });
  }

  // Register coach
  const result = await authService.register({ name, email, password }, 'coach');

  res.status(201).json({
    message: 'Coach registered successfully. Please create your team.',
    token: result.token,
    coach: {
      id: result.user._id,
      name: result.user.name,
      email: result.user.email,
      hasTeam: false
    }
  });
});

/**
 * Login coach
 * 
 * @route POST /api/coach/login
 * @access Public
 */
const loginCoach = asyncHandler(async (req, res) => {
  const authService = container.resolve('authenticationService');
  const { email, password } = req.body;
  const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require('../../utils/accountLockout');

  // Check if account is locked
  const lockStatus = checkAccountLockout(email);
  if (lockStatus.isLocked) {
    return res.status(429).json({ 
      message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockStatus.remainingTime} minutes.`,
      remainingTime: lockStatus.remainingTime
    });
  }

  try {
    // Attempt login
    const result = await authService.login(email, password, 'coach');

    // Clear failed attempts on successful login
    clearFailedAttempts(email);

    res.json({
      message: 'Login successful',
      token: result.token,
      coach: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        team: result.user.team
      }
    });
  } catch (error) {
    // Record failed attempt
    const failureStatus = recordFailedAttempt(email);
    if (failureStatus.isLocked) {
      return res.status(429).json({ 
        message: `Account locked due to multiple failed login attempts. Please try again in ${failureStatus.remainingTime} minutes.`,
        remainingTime: failureStatus.remainingTime
      });
    }
    throw error;
  }
});

/**
 * Get coach profile
 * 
 * @route GET /api/coach/profile
 * @access Private (Coach)
 */
const getCoachProfile = asyncHandler(async (req, res) => {
  const coachService = container.resolve('coachService');
  
  const coach = await coachService.getProfile(req.user._id);

  res.json({ coach });
});

/**
 * Get coach registration status (what step they're on)
 * 
 * @route GET /api/coach/status
 * @access Private (Coach)
 */
const getCoachStatus = asyncHandler(async (req, res) => {
  const teamService = container.resolve('teamService');
  const Team = require('../../models/Team');
  
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
});

/**
 * Create team (without competition context initially)
 * 
 * @route POST /api/coach/team
 * @access Private (Coach)
 */
const createTeam = asyncHandler(async (req, res) => {
  const teamService = container.resolve('teamService');
  const { name, description } = req.body;

  const team = await teamService.createTeam({
    name,
    description,
    coach: req.user._id
  });

  res.status(201).json({
    message: 'Team created successfully. You can now register it for competitions.',
    team: {
      id: team._id,
      name: team.name,
      description: team.description
    }
  });
});

/**
 * Get all teams for the coach
 * 
 * @route GET /api/coach/teams
 * @access Private (Coach)
 */
const getCoachTeams = asyncHandler(async (req, res) => {
  const teamService = container.resolve('teamService');
  const competitionService = container.resolve('competitionService');
  const Team = require('../../models/Team');
  const Competition = require('../../models/Competition');

  const teams = await Team.find({ coach: req.user._id })
    .select('name description isActive');

  // Get competition registrations for each team from Competition.registeredTeams
  const competitions = await Competition.find({
    'registeredTeams.coach': req.user._id
  })
    .select('name level place startDate endDate status registeredTeams')
    .populate('registeredTeams.team', 'name');

  // Build teams with their competition registrations
  const teamsWithCompetitions = teams.map(team => {
    const teamRegistrations = [];
    
    competitions.forEach(comp => {
      const registration = comp.registeredTeams.find(
        rt => rt.team && rt.team._id.toString() === team._id.toString()
      );
      
      if (registration) {
        teamRegistrations.push({
          competition: {
            _id: comp._id,
            name: comp.name,
            level: comp.level,
            place: comp.place,
            startDate: comp.startDate,
            endDate: comp.endDate,
            status: comp.status
          },
          isSubmitted: registration.isSubmitted,
          paymentStatus: registration.paymentStatus,
          playerCount: registration.players.length
        });
      }
    });

    return {
      id: team._id,
      name: team.name,
      description: team.description,
      isActive: team.isActive,
      competitions: teamRegistrations
    };
  });

  res.json({ teams: teamsWithCompetitions });
});

/**
 * Get all open competitions (upcoming and ongoing)
 * 
 * @route GET /api/coach/competitions/open
 * @access Private (Coach)
 */
const getOpenCompetitions = asyncHandler(async (req, res) => {
  const competitionService = container.resolve('competitionService');

  const openCompetitions = await competitionService.getCompetitions({
    status: { $in: ['upcoming', 'ongoing'] },
    isDeleted: false
  }, {
    select: 'name level place startDate endDate status description',
    sort: { startDate: 1 }
  });

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
});

/**
 * Register team for a specific competition
 * 
 * @route POST /api/coach/team/:teamId/register
 * @access Private (Coach)
 */
const registerTeamForCompetition = asyncHandler(async (req, res) => {
  const registrationService = container.resolve('registrationService');
  const teamService = container.resolve('teamService');
  const competitionService = container.resolve('competitionService');
  const { teamId } = req.params;
  const { competitionId } = req.body;
  const Team = require('../../models/Team');
  const Competition = require('../../models/Competition');

  // Validate team exists and belongs to coach
  const team = await Team.findOne({ 
    _id: teamId,
    coach: req.user._id
  });

  if (!team) {
    throw new NotFoundError('Team not found or does not belong to you');
  }

  // Validate competition exists and is open
  const competition = await Competition.findById(competitionId);
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  if (competition.isDeleted) {
    throw new ValidationError('This competition has been deleted');
  }

  if (competition.status === 'completed') {
    throw new ValidationError('Cannot register for a completed competition');
  }

  // Check if team is already registered for this competition
  const existingRegistration = competition.findRegisteredTeam(teamId);

  if (existingRegistration) {
    // Team is already registered - populate and return
    await competition.populate([
      { path: 'registeredTeams.team', select: 'name description' },
      { path: 'registeredTeams.coach', select: 'name email' }
    ]);

    // Find the registered team after population
    const populatedTeam = competition.registeredTeams.find(rt => 
      rt.team && rt.team._id && rt.team._id.toString() === teamId.toString()
    );

    if (!populatedTeam) {
      throw new Error('Error retrieving registered team');
    }

    return res.json({
      message: 'Team is already registered for this competition',
      competitionTeam: {
        id: populatedTeam._id,
        team: populatedTeam.team,
        competition: {
          _id: competition._id,
          name: competition.name,
          level: competition.level,
          place: competition.place,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status
        },
        players: populatedTeam.players
      }
    });
  }

  // Register team for competition
  const registeredTeam = competition.registerTeam(teamId, req.user._id);
  await competition.save();

  // Populate for response
  await competition.populate([
    { path: 'registeredTeams.team', select: 'name description' },
    { path: 'registeredTeams.coach', select: 'name email' }
  ]);

  // Find the registered team after population
  const populatedTeam = competition.registeredTeams.find(rt => 
    rt.team && rt.team._id && rt.team._id.toString() === teamId.toString()
  );

  if (!populatedTeam) {
    throw new Error('Error retrieving registered team');
  }

  res.json({
    message: 'Team registered for competition successfully. You can now add players.',
    competitionTeam: {
      id: populatedTeam._id,
      team: populatedTeam.team,
      competition: {
        _id: competition._id,
        name: competition.name,
        level: competition.level,
        place: competition.place,
        startDate: competition.startDate,
        endDate: competition.endDate,
        status: competition.status
      },
      players: populatedTeam.players
    }
  });
});

module.exports = {
  registerCoach,
  loginCoach,
  getCoachProfile,
  getCoachStatus,
  createTeam,
  getCoachTeams,
  getOpenCompetitions,
  registerTeamForCompetition
};

/**
 * Select competition for coach's team (simplified version)
 * 
 * @route POST /api/coach/team/select-competition
 * @access Private (Coach)
 */
const selectCompetitionForTeam = asyncHandler(async (req, res) => {
  const teamService = container.resolve('teamService');
  const competitionService = container.resolve('competitionService');
  const { competitionId } = req.body;
  const Team = require('../../models/Team');
  const Competition = require('../../models/Competition');

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

    throw new NotFoundError('No team found. Please create a team first.');
  }

  // Validate competition exists and is open
  const competition = await Competition.findById(competitionId);
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  if (competition.isDeleted) {
    throw new ValidationError('This competition has been deleted');
  }

  if (competition.status === 'completed') {
    throw new ValidationError('Cannot register for a completed competition');
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
});

/**
 * Get team dashboard
 * 
 * @route GET /api/coach/team/dashboard
 * @access Private (Coach) - Requires competition context
 */
const getTeamDashboard = asyncHandler(async (req, res) => {
  const Competition = require('../../models/Competition');

  // Find competition and the coach's registered team
  const competition = await Competition.findById(req.competitionId)
    .populate('registeredTeams.coach', 'name email')
    .populate('registeredTeams.team', 'name description')
    .populate('registeredTeams.players.player', 'firstName lastName email dateOfBirth gender');

  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  // Find the coach's team registration in this competition
  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach && rt.coach._id && rt.coach._id.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    // Return empty state instead of 404 to allow coaches to register teams
    return res.status(200).json({ 
      team: null,
      message: 'No team registered for this competition. Please register a team to get started.'
    });
  }

  // Check if team reference exists
  if (!registeredTeam.team) {
    return res.status(200).json({ 
      team: null,
      message: 'Team data is missing. Please contact support.'
    });
  }

  // Format response to match frontend expectations
  res.json({ 
    team: {
      _id: registeredTeam.team._id,
      name: registeredTeam.team.name,
      description: registeredTeam.team.description || '',
      competition: {
        _id: competition._id,
        name: competition.name,
        level: competition.level,
        place: competition.place,
        startDate: competition.startDate,
        endDate: competition.endDate,
        status: competition.status
      },
      coach: registeredTeam.coach,
      isActive: registeredTeam.isActive,
      isSubmitted: registeredTeam.isSubmitted,
      paymentStatus: registeredTeam.paymentStatus,
      players: registeredTeam.players,
      createdAt: registeredTeam.createdAt || competition.createdAt,
      updatedAt: registeredTeam.updatedAt || competition.updatedAt,
      __v: 0
    }
  });
});

/**
 * Search players for team assignment
 * 
 * @route GET /api/coach/players/search
 * @access Private (Coach) - Requires competition context
 */
const searchPlayers = asyncHandler(async (req, res) => {
  const { query } = req.query;
  const Player = require('../../models/Player');
  const Competition = require('../../models/Competition');
  
  if (!query || query.length < 2) {
    return res.json({ players: [] });
  }

  // Find the coach's registered team for the current competition
  const competition = await Competition.findById(req.competitionId)
    .populate('registeredTeams.team');

  if (!competition) {
    return res.json({ players: [] });
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam || !registeredTeam.team) {
    return res.json({ players: [] });
  }

  // Search only players registered for the same team
  const players = await Player.find({
    team: registeredTeam.team._id,
    $or: [
      { firstName: { $regex: query, $options: 'i' } },
      { lastName: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } }
    ]
  })
    .populate('team', 'name competition')
    .select('firstName lastName email dateOfBirth gender team ageGroup');

  res.json({ players });
});

/**
 * Add player to age group
 * 
 * @route POST /api/coach/team/players
 * @access Private (Coach) - Requires competition context
 */
const addPlayerToAgeGroup = asyncHandler(async (req, res) => {
  const { playerId, ageGroup, gender } = req.body;
  const Player = require('../../models/Player');
  const Competition = require('../../models/Competition');

  // Find competition and coach's registered team
  const competition = await Competition.findById(req.competitionId);
  
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    throw new NotFoundError('Team not registered for this competition');
  }

  // Check if player exists
  const player = await Player.findById(playerId);
  if (!player) {
    throw new NotFoundError('Player not found');
  }

  // Add player to team using Competition method
  competition.addPlayerToTeam(registeredTeam.team, playerId, ageGroup, gender);
  await competition.save();

  res.json({ message: 'Player added to team successfully' });
});

/**
 * Remove player from age group
 * 
 * @route DELETE /api/coach/team/players/:playerId
 * @access Private (Coach) - Requires competition context
 */
const removePlayerFromAgeGroup = asyncHandler(async (req, res) => {
  const { playerId } = req.params;
  const Competition = require('../../models/Competition');

  // Find competition and coach's registered team
  const competition = await Competition.findById(req.competitionId);
  
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    throw new NotFoundError('Team not registered for this competition');
  }

  // Remove player from team using Competition method
  competition.removePlayerFromTeam(registeredTeam.team, playerId);
  await competition.save();

  res.json({ message: 'Player removed from team successfully' });
});

/**
 * Create Razorpay order for team submission
 * 
 * @route POST /api/coach/team/payment/create-order
 * @access Private (Coach) - Requires competition context
 */
const createTeamPaymentOrder = asyncHandler(async (req, res) => {
  const { getRazorpayInstance, isRazorpayConfigured } = require('../../utils/razorpayService');
  const Competition = require('../../models/Competition');

  if (!isRazorpayConfigured()) {
    return res.status(503).json({ message: 'Payment service is not configured' });
  }

  // Find competition and coach's registered team
  const competition = await Competition.findById(req.competitionId)
    .populate('registeredTeams.team', 'name');
  
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    throw new NotFoundError('Team not registered for this competition');
  }

  // Check if team has players
  if (!registeredTeam.players || registeredTeam.players.length === 0) {
    throw new ValidationError('Cannot submit team without players');
  }

  // Check if team is already submitted
  if (registeredTeam.isSubmitted) {
    throw new ValidationError('Team has already been submitted');
  }

  const TEAM_REGISTRATION_BASE_FEE = 500;
  const TEAM_REGISTRATION_PER_PLAYER_FEE = 100;
  const calculateTeamRegistrationAmount = (playerCount) =>
    TEAM_REGISTRATION_BASE_FEE + (playerCount * TEAM_REGISTRATION_PER_PLAYER_FEE);

  const totalAmount = calculateTeamRegistrationAmount(registeredTeam.players.length);
  const razorpay = getRazorpayInstance();

  const compactTeamId = String(registeredTeam._id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-12);
  const compactTs = Date.now().toString(36);
  const receipt = `tm_${compactTeamId}_${compactTs}`.slice(0, 40);

  const order = await razorpay.orders.create({
    amount: totalAmount * 100,
    currency: 'INR',
    receipt,
    notes: {
      competitionId: String(competition._id),
      teamId: String(registeredTeam.team?._id || registeredTeam.team),
      coachId: String(req.user._id),
    },
  });

  registeredTeam.paymentStatus = 'pending';
  registeredTeam.paymentGateway = 'razorpay';
  registeredTeam.paymentOrderId = order.id;
  await competition.save();

  res.json({
    message: 'Payment order created successfully',
    order: {
      id: order.id,
      amount: totalAmount,
      currency: order.currency,
    },
    team: {
      name: registeredTeam.team?.name || 'Team',
      playerCount: registeredTeam.players.length,
    },
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  });
});

/**
 * Verify Razorpay payment and submit team atomically
 * 
 * @route POST /api/coach/team/payment/verify
 * @access Private (Coach) - Requires competition context
 */
const verifyTeamPaymentAndSubmit = asyncHandler(async (req, res) => {
  const { getRazorpayInstance, verifyRazorpaySignature } = require('../../utils/razorpayService');
  const Competition = require('../../models/Competition');
  const Transaction = require('../../models/Transaction');
  const mongoose = require('mongoose');

  const {
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('Invalid payment verification payload');
  }

  const isSignatureValid = verifyRazorpaySignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!isSignatureValid) {
    throw new ValidationError('Payment signature verification failed');
  }

  // Find competition and coach's registered team
  const competition = await Competition.findById(req.competitionId)
    .populate('registeredTeams.team', 'name');
  
  if (!competition) {
    throw new NotFoundError('Competition not found');
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    throw new NotFoundError('Team not registered for this competition');
  }

  if (registeredTeam.isSubmitted) {
    return res.status(200).json({ message: 'Team has already been submitted' });
  }

  if (!registeredTeam.players || registeredTeam.players.length === 0) {
    throw new ValidationError('Cannot submit team without players');
  }

  if (registeredTeam.paymentOrderId && registeredTeam.paymentOrderId !== razorpayOrderId) {
    throw new ValidationError('Payment order does not match the active order');
  }

  const TEAM_REGISTRATION_BASE_FEE = 500;
  const TEAM_REGISTRATION_PER_PLAYER_FEE = 100;
  const calculateTeamRegistrationAmount = (playerCount) =>
    TEAM_REGISTRATION_BASE_FEE + (playerCount * TEAM_REGISTRATION_PER_PLAYER_FEE);

  // Verify payment amount matches the expected amount for current roster
  const expectedAmount = calculateTeamRegistrationAmount(registeredTeam.players.length);
  
  // Fetch the actual payment details from Razorpay to verify captured amount
  const razorpay = getRazorpayInstance();
  let actualPaymentAmount;
  
  try {
    const payment = await razorpay.payments.fetch(razorpayPaymentId);
    actualPaymentAmount = payment.amount / 100; // Convert paise to rupees
    
    // Verify the captured amount matches expected amount
    if (actualPaymentAmount !== expectedAmount) {
      throw new ValidationError('Payment amount mismatch. The payment amount does not match the current team roster.', {
        expected: expectedAmount,
        received: actualPaymentAmount,
        playerCount: registeredTeam.players.length
      });
    }
  } catch (paymentFetchError) {
    if (paymentFetchError instanceof ValidationError) {
      throw paymentFetchError;
    }
    throw new Error('Unable to verify payment amount. Please contact support.');
  }

  const totalAmount = expectedAmount;

  // Use mongoose session for atomic transaction
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Update team submission status
      registeredTeam.isSubmitted = true;
      registeredTeam.submittedAt = new Date();
      registeredTeam.paymentStatus = 'completed';
      registeredTeam.paymentAmount = totalAmount;
      registeredTeam.paymentGateway = 'razorpay';
      registeredTeam.paymentOrderId = razorpayOrderId;
      registeredTeam.paymentId = razorpayPaymentId;
      registeredTeam.paymentSignature = razorpaySignature;
      registeredTeam.paymentVerifiedAt = new Date();

      await competition.save({ session });

      // Derive safe teamId for transaction
      const teamId = registeredTeam.team?._id || registeredTeam.team;
      const teamName = registeredTeam.team?.name || 'Unknown';

      // Record transaction for this competition-specific payment
      await Transaction.create([{
        competition: competition._id,
        team: teamId,
        coach: registeredTeam.coach,
        source: 'coach',
        type: 'team_submission',
        amount: totalAmount,
        paymentStatus: registeredTeam.paymentStatus,
        description: `Team "${teamName}" submitted for competition`,
        metadata: {
          playerCount: registeredTeam.players.length,
          paymentGateway: 'razorpay',
          razorpayOrderId,
          razorpayPaymentId,
        },
      }], { session });
    });

    await session.endSession();

    res.json({ 
      message: 'Team submitted successfully',
      submissionDetails: {
        teamName: registeredTeam.team.name,
        playerCount: registeredTeam.players.length,
        paymentAmount: totalAmount,
        submittedAt: registeredTeam.submittedAt,
        paymentGateway: 'razorpay',
        paymentId: razorpayPaymentId,
      }
    });
  } catch (txError) {
    await session.endSession();
    throw new Error('Failed to complete team submission and payment recording. Please try again.');
  }
});

/**
 * Get team status for current competition
 * 
 * @route GET /api/coach/team/status
 * @access Private (Coach) - Requires competition context
 */
const getTeamStatus = asyncHandler(async (req, res) => {
  const Competition = require('../../models/Competition');

  // Find competition and check if coach has a registered team
  const competition = await Competition.findById(req.competitionId)
    .populate('registeredTeams.team', 'name description')
    .populate('registeredTeams.players.player', 'firstName lastName email');

  if (!competition) {
    return res.json({ 
      hasTeam: false, 
      team: null 
    });
  }

  const registeredTeam = competition.registeredTeams.find(
    rt => rt.coach.toString() === req.user._id.toString()
  );

  if (!registeredTeam) {
    return res.json({ 
      hasTeam: false, 
      team: null 
    });
  }

  res.json({ 
    hasTeam: true, 
    team: {
      id: registeredTeam.team?._id || null,
      name: registeredTeam.team?.name || '',
      description: registeredTeam.team?.description || '',
      isSubmitted: registeredTeam.isSubmitted,
      paymentStatus: registeredTeam.paymentStatus,
      playerCount: registeredTeam.players.length,
      competition: {
        _id: competition._id,
        name: competition.name,
        level: competition.level,
        place: competition.place,
        startDate: competition.startDate,
        endDate: competition.endDate,
        status: competition.status
      }
    }
  });
});

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
  createTeamPaymentOrder,
  verifyTeamPaymentAndSubmit,
  getTeamStatus
};
