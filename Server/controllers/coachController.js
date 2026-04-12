const Coach = require('../models/Coach');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');
const Transaction = require('../models/Transaction');
const { getRazorpayInstance, verifyRazorpaySignature, isRazorpayConfigured } = require('../utils/razorpayService');

const TEAM_REGISTRATION_BASE_FEE = 500;
const TEAM_REGISTRATION_PER_PLAYER_FEE = 100;

const calculateTeamRegistrationAmount = (playerCount) =>
  TEAM_REGISTRATION_BASE_FEE + (playerCount * TEAM_REGISTRATION_PER_PLAYER_FEE);

// Register a new coach
const registerCoach = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate password strength
    const { validatePassword } = require('../utils/passwordValidation');
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({ 
        message: 'Password does not meet requirements',
        errors: passwordCheck.errors 
      });
    }

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
    const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require('../utils/accountLockout');

    // Check if account is locked
    const lockStatus = checkAccountLockout(email);
    if (lockStatus.isLocked) {
      return res.status(429).json({ 
        message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockStatus.remainingTime} minutes.`,
        remainingTime: lockStatus.remainingTime
      });
    }

    // Find coach by email
    const coach = await Coach.findOne({ email });
    if (!coach) {
      recordFailedAttempt(email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await coach.comparePassword(password);
    if (!isMatch) {
      const failureStatus = recordFailedAttempt(email);
      if (failureStatus.isLocked) {
        return res.status(429).json({ 
          message: `Account locked due to multiple failed login attempts. Please try again in ${failureStatus.remainingTime} minutes.`,
          remainingTime: failureStatus.remainingTime
        });
      }
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(email);

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
        return res.status(500).json({ message: 'Error retrieving registered team' });
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
      return res.status(500).json({ message: 'Error retrieving registered team' });
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
    // Find competition and the coach's registered team
    const competition = await Competition.findById(req.competitionId)
      .populate('registeredTeams.coach', 'name email')
      .populate('registeredTeams.team', 'name description')
      .populate('registeredTeams.players.player', 'firstName lastName email dateOfBirth gender');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
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
  } catch (error) {
    console.error('Search players error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add player to age group
const addPlayerToAgeGroup = async (req, res) => {
  try {
    const { playerId, ageGroup, gender } = req.body;

    // Find competition and coach's registered team
    const competition = await Competition.findById(req.competitionId);
    
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === req.user._id.toString()
    );

    if (!registeredTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Check if player exists
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Add player to team using Competition method
    competition.addPlayerToTeam(registeredTeam.team, playerId, ageGroup, gender);
    await competition.save();

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

    // Find competition and coach's registered team
    const competition = await Competition.findById(req.competitionId);
    
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === req.user._id.toString()
    );

    if (!registeredTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Remove player from team using Competition method
    competition.removePlayerFromTeam(registeredTeam.team, playerId);
    await competition.save();

    res.json({ message: 'Player removed from team successfully' });
  } catch (error) {
    console.error('Remove player from age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create Razorpay order for team submission
const createTeamPaymentOrder = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({ message: 'Payment service is not configured' });
    }

    // Find competition and coach's registered team
    const competition = await Competition.findById(req.competitionId)
      .populate('registeredTeams.team', 'name');
    
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === req.user._id.toString()
    );

    if (!registeredTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    // Check if team has players
    if (!registeredTeam.players || registeredTeam.players.length === 0) {
      return res.status(400).json({ message: 'Cannot submit team without players' });
    }

    // Check if team is already submitted
    if (registeredTeam.isSubmitted) {
      return res.status(400).json({ message: 'Team has already been submitted' });
    }

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
  } catch (error) {
    console.error('Create team payment order error:', error);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
};

// Verify Razorpay payment and submit team atomically
const verifyTeamPaymentAndSubmit = async (req, res) => {
  try {
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: 'Invalid payment verification payload' });
    }

    const isSignatureValid = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isSignatureValid) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }

    // Find competition and coach's registered team
    const competition = await Competition.findById(req.competitionId)
      .populate('registeredTeams.team', 'name');
    
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const registeredTeam = competition.registeredTeams.find(
      rt => rt.coach.toString() === req.user._id.toString()
    );

    if (!registeredTeam) {
      return res.status(404).json({ message: 'Team not registered for this competition' });
    }

    if (registeredTeam.isSubmitted) {
      return res.status(200).json({ message: 'Team has already been submitted' });
    }

    if (!registeredTeam.players || registeredTeam.players.length === 0) {
      return res.status(400).json({ message: 'Cannot submit team without players' });
    }

    if (registeredTeam.paymentOrderId && registeredTeam.paymentOrderId !== razorpayOrderId) {
      return res.status(400).json({ message: 'Payment order does not match the active order' });
    }

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
        return res.status(400).json({ 
          message: 'Payment amount mismatch. The payment amount does not match the current team roster.',
          details: {
            expected: expectedAmount,
            received: actualPaymentAmount,
            playerCount: registeredTeam.players.length
          }
        });
      }
    } catch (paymentFetchError) {
      console.error('Failed to fetch payment details from Razorpay:', paymentFetchError);
      return res.status(500).json({ 
        message: 'Unable to verify payment amount. Please contact support.',
        error: 'Payment verification failed'
      });
    }

    const totalAmount = expectedAmount;

    // Use mongoose session for atomic transaction
    const mongoose = require('mongoose');
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
      console.error('Submit team - transaction failed:', txError);
      throw new Error('Failed to complete team submission and payment recording. Please try again.');
    }
  } catch (error) {
    console.error('Verify team payment error:', error);
    res.status(500).json({ 
      message: error.message || 'Server error',
      details: 'Payment verification and team submission must complete together'
    });
  }
};

// Get team status for current competition
const getTeamStatus = async (req, res) => {
  try {
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
  createTeamPaymentOrder,
  verifyTeamPaymentAndSubmit,
  getTeamStatus
};
