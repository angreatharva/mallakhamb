const Admin = require('../models/Admin');
const Team = require('../models/Team');
const CompetitionTeam = require('../models/CompetitionTeam');
const Player = require('../models/Player');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');
const { convertToObjectId, isValidObjectId, createObjectIdError, validateAndConvertObjectId } = require('../utils/objectIdUtils');
const { logFailedLogin, logSuccessfulLogin } = require('../middleware/securityLogger');

// Register a new admin
const registerAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    // Create new admin
    const admin = new Admin({
      name,
      email,
      password
    });

    await admin.save();

    // Generate token
    const token = generateToken(admin._id, 'admin');

    res.status(201).json({
      message: 'Admin registered successfully',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login admin
const loginAdmin = async (req, res) => {
  console.log('🔍 Admin login attempt:', { email: req.body.email, origin: req.headers.origin });
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find admin by email
    console.log('🔍 Looking for admin with email:', email);
    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.log('❌ Admin not found for email:', email);
      logFailedLogin(email, 'admin', 'Admin not found', req);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    console.log('🔍 Checking password for admin:', admin.email);
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Password mismatch for admin:', admin.email);
      logFailedLogin(email, 'admin', 'Invalid password', req);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    console.log('✅ Generating token for admin:', admin.email);
    const token = generateToken(admin._id, 'admin');

    console.log('✅ Admin login successful:', admin.email);
    logSuccessfulLogin(admin._id, 'admin', req);
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
    console.error('❌ Admin login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get admin profile
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select('-password');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ admin });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get dashboard statistics (competition-scoped: uses CompetitionTeam for current competition)
const getDashboardStats = async (req, res) => {
  try {
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Only count teams that have completed payment
    const competitionTeams = await CompetitionTeam.find({
      competition: req.competitionId,
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

    const teamStats = competitionTeams.map(ct => {
      const teamPlayers = ct.players || [];
      const boys = teamPlayers.filter(p => p.gender === 'Male').length;
      const girls = teamPlayers.filter(p => p.gender === 'Female').length;

      totalParticipants += teamPlayers.length;
      totalBoys += boys;
      totalGirls += girls;
      if (boys > girls) boysTeams++;
      else if (girls > boys) girlsTeams++;
      totalTeams += 1;

      return {
        id: ct.team?._id,
        name: ct.team?.name || 'Unknown',
        coach: ct.coach?.name || 'No coach',
        totalPlayers: teamPlayers.length,
        boys,
        girls,
        description: ct.team?.description,
        competition: ct.competition
      };
    });

    res.json({
      stats: {
        totalTeams,
        totalParticipants,
        totalBoys,
        totalGirls,
        boysTeams,
        girlsTeams
      },
      teams: teamStats
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams (competition-scoped: uses CompetitionTeam for current competition)
const getAllTeams = async (req, res) => {
  try {
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    const { gender, ageGroup, search, submissionStatus, paymentStatus } = req.query;

    let query = { competition: req.competitionId, isActive: true };

    if (submissionStatus !== undefined) {
      query.isSubmitted = submissionStatus === 'true' || submissionStatus === true;
    }
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    let competitionTeams = await CompetitionTeam.find(query)
      .populate('team', 'name description')
      .populate('coach', 'name email')
      .populate('players.player', 'firstName lastName gender dateOfBirth');

    let filteredTeams = competitionTeams;

    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      filteredTeams = filteredTeams.filter(ct => {
        const teamNameMatch = ct.team?.name?.toLowerCase().includes(searchLower);
        const coachNameMatch = ct.coach?.name?.toLowerCase().includes(searchLower);
        return teamNameMatch || coachNameMatch;
      });
    }

    if (gender || ageGroup) {
      filteredTeams = filteredTeams.filter(ct => {
        const teamPlayers = ct.players || [];
        if (gender && ageGroup) {
          return teamPlayers.some(p => p.gender === gender && p.ageGroup === ageGroup);
        }
        if (gender) {
          const genderCount = teamPlayers.filter(p => p.gender === gender).length;
          const otherCount = teamPlayers.filter(p => p.gender !== gender).length;
          return genderCount > otherCount;
        }
        if (ageGroup) return teamPlayers.some(p => p.ageGroup === ageGroup);
        return true;
      });
    }

    const teams = filteredTeams.map(ct => ({
      _id: ct.team?._id,
      name: ct.team?.name,
      description: ct.team?.description,
      coach: ct.coach,
      players: ct.players,
      competition: ct.competition,
      isSubmitted: ct.isSubmitted,
      paymentStatus: ct.paymentStatus,
      submittedAt: ct.submittedAt
    }));

    res.json({ teams });
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team details (competition-scoped: team + competition from CompetitionTeam)
const getTeamDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    const competitionTeam = await CompetitionTeam.findOne({
      team: teamId,
      competition: req.competitionId,
      isActive: true
    })
      .populate('team', 'name description')
      .populate('coach', 'name email')
      .populate('players.player', 'firstName lastName gender dateOfBirth email');

    if (!competitionTeam || !competitionTeam.team) {
      return res.status(404).json({
        message: 'Team not found or does not belong to the current competition'
      });
    }

    const team = {
      _id: competitionTeam.team._id,
      name: competitionTeam.team.name,
      description: competitionTeam.team.description,
      coach: competitionTeam.coach,
      players: competitionTeam.players,
      isSubmitted: competitionTeam.isSubmitted,
      paymentStatus: competitionTeam.paymentStatus,
      submittedAt: competitionTeam.submittedAt
    };

    res.json({ team });
  } catch (error) {
    console.error('Get team details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all players
const getAllPlayers = async (req, res) => {
  try {
    const { teamId, ageGroup, gender, search } = req.query;

    let query = { isActive: true };

    if (teamId) query.team = teamId;
    if (ageGroup) query.ageGroup = ageGroup;
    if (gender) query.gender = gender;

    // Get players and populate team with competition info
    let players = await Player.find(query)
      .populate({
        path: 'team',
        select: 'name competition',
        match: req.competitionId ? { competition: req.competitionId } : {}
      })
      .select('firstName lastName gender dateOfBirth email ageGroup team');

    // Filter out players whose teams don't match the competition context
    // (team will be null if it doesn't match the competition filter)
    players = players.filter(player => player.team !== null);

    // Apply search functionality: by player name, team, age group, gender
    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      players = players.filter(player => {
        const firstNameMatch = player.firstName && player.firstName.toLowerCase().includes(searchLower);
        const lastNameMatch = player.lastName && player.lastName.toLowerCase().includes(searchLower);
        const fullNameMatch = `${player.firstName} ${player.lastName}`.toLowerCase().includes(searchLower);
        const teamNameMatch = player.team && player.team.name && player.team.name.toLowerCase().includes(searchLower);
        return firstNameMatch || lastNameMatch || fullNameMatch || teamNameMatch;
      });
    }

    res.json({ players });
  } catch (error) {
    console.error('Get all players error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add score
const addScore = async (req, res) => {
  try {
    const { playerId, teamId, ageGroup, gender, score, event, description } = req.body;

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Check if competition is completed
    const competition = await Competition.findById(req.competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }
    
    if (competition.status === 'completed') {
      return res.status(403).json({ 
        message: 'Cannot add scores for a completed competition' 
      });
    }

    const competitionTeam = await CompetitionTeam.findOne({
      team: teamId,
      competition: req.competitionId,
      isActive: true
    });
    if (!competitionTeam) {
      return res.status(404).json({
        message: 'Team not found or does not belong to the current competition'
      });
    }

    const player = await Player.findOne({ _id: playerId, team: teamId });
    if (!player) {
      return res.status(404).json({ message: 'Player not found in the specified team' });
    }

    // Create new score
    const newScore = new Score({
      player: playerId,
      team: teamId,
      ageGroup,
      gender,
      score,
      event,
      description,
      addedBy: req.user._id,
      competition: req.competitionId // Associate with current competition
    });

    await newScore.save();

    res.status(201).json({
      message: 'Score added successfully',
      score: newScore
    });
  } catch (error) {
    console.error('Add score error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get team scores
const getTeamScores = async (req, res) => {
  try {
    const { ageGroup, gender, teamId } = req.query;

    let matchQuery = {};
    if (ageGroup) matchQuery.ageGroup = ageGroup;
    if (gender) matchQuery.gender = gender;

    // Filter by current competition
    if (req.competitionId) {
      matchQuery.competition = convertToObjectId(req.competitionId);
    }

    // Handle teamId parameter for specific team retrieval
    if (teamId) {
      // Enhanced validation for teamId parameter format
      if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
        console.warn(`Empty or invalid teamId parameter provided: ${teamId}`);
        return res.status(400).json({
          error: 'Invalid Request',
          message: 'teamId parameter cannot be empty',
          field: 'teamId',
          value: teamId
        });
      }

      const trimmedTeamId = teamId.trim();

      // Validate ObjectId format before conversion
      if (!isValidObjectId(trimmedTeamId)) {
        return res.status(400).json(createObjectIdError('teamId', trimmedTeamId));
      }

      const teamObjectId = convertToObjectId(trimmedTeamId);
      if (!teamObjectId) {
        return res.status(400).json({
          error: 'Conversion Failed',
          message: `Unable to convert teamId to valid ObjectId format: ${trimmedTeamId}`,
          field: 'teamId',
          value: trimmedTeamId,
          expectedFormat: '24-character hexadecimal string'
        });
      }

      matchQuery.teamId = teamObjectId;

      // For specific team, return detailed scores instead of aggregated data
      const teamScores = await Score.find(matchQuery)
        .populate('teamId', 'name')
        .sort({ createdAt: -1 });

      // Handle edge case where teamId is valid but no scores exist
      if (teamScores.length === 0) {
        // Check if the team exists at all to provide better error messaging
        const Team = require('../models/Team');
        const teamExists = await Team.findById(teamObjectId);

        if (!teamExists) {
          return res.status(404).json({
            error: 'Team Not Found',
            message: `No team found with ID: ${trimmedTeamId}`,
            teamId: trimmedTeamId,
            teamScores: []
          });
        }

        return res.json({
          teamScores: [],
          message: `No scores found for team "${teamExists.name}" with the specified filters`,
          teamId: trimmedTeamId,
          teamName: teamExists.name,
          filters: {
            ageGroup: ageGroup || null,
            gender: gender || null
          }
        });
      }

      console.log(`Found ${teamScores.length} score record(s) for team: ${trimmedTeamId}`);

      // Format the response for specific team scores
      const formattedScores = teamScores.map(score => ({
        _id: score._id,
        teamId: score.teamId._id,
        teamName: score.teamId.name,
        gender: score.gender,
        ageGroup: score.ageGroup,
        timeKeeper: score.timeKeeper,
        scorer: score.scorer,
        remarks: score.remarks,
        isLocked: score.isLocked,
        playerScores: score.playerScores,
        createdAt: score.createdAt,
        updatedAt: score.updatedAt
      }));

      return res.json({ teamScores: formattedScores });
    }

    // Original aggregation behavior when teamId is not provided (backward compatibility)
    const teamScores = await Score.aggregate([
      { $match: matchQuery },
      { $unwind: '$playerScores' },
      {
        $lookup: {
          from: 'teams',
          localField: 'teamId',
          foreignField: '_id',
          as: 'team'
        }
      },
      {
        $unwind: '$team'
      },
      {
        $addFields: {
          // Flatten all player scores from all score documents for this team
          allPlayerScores: {
            $reduce: {
              input: '$playerScores',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] }
            }
          }
        }
      },
      {
        $addFields: {
          totalScore: {
            $sum: '$allPlayerScores.finalScore'
          },
          playerCount: {
            $size: '$allPlayerScores'
          }
        }
      },
      {
        $project: {
          teamName: '$team.name',
          totalScore: 1,
          playerCount: 1,
          scoreCount: 1,
          isLocked: 1,
          averageScore: {
            $cond: {
              if: { $gt: ['$playerCount', 0] },
              then: { $divide: ['$totalScore', '$playerCount'] },
              else: 0
            }
          }
        }
      },
      { $sort: { totalScore: -1 } }
    ]);

    res.json({ teamScores });
  } catch (error) {
    // Enhanced error logging with more context
    console.error('Get team scores error:', {
      message: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date().toISOString()
    });

    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      console.error('MongoDB CastError in getTeamScores:', error.message);
      return res.status(400).json({
        error: 'Database Query Error',
        message: 'Invalid data format in query parameters',
        details: error.message
      });
    }

    // Handle MongoDB connection errors
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      console.error('MongoDB connection error in getTeamScores:', error.message);
      return res.status(503).json({
        error: 'Database Connection Error',
        message: 'Unable to connect to database. Please try again later.'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error('MongoDB validation error in getTeamScores:', error.message);
      return res.status(400).json({
        error: 'Data Validation Error',
        message: 'Invalid data provided',
        details: error.message
      });
    }

    // Generic server error with request context
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while retrieving team scores',
      timestamp: new Date().toISOString()
    });
  }
};

// Get individual scores
const getIndividualScores = async (req, res) => {
  try {
    const { ageGroup, gender } = req.query;

    let matchQuery = {};
    if (ageGroup) matchQuery.ageGroup = ageGroup;
    if (gender) matchQuery.gender = gender;

    // Filter by current competition
    if (req.competitionId) {
      matchQuery.competition = convertToObjectId(req.competitionId);
    }

    // First, let's check if we have any scores at all
    const totalScores = await Score.countDocuments(matchQuery);

    if (totalScores === 0) {
      return res.json({ individualScores: [] });
    }

    const individualScores = await Score.aggregate([
      { $match: matchQuery },
      { $unwind: '$playerScores' },
      {
        $lookup: {
          from: 'teams',
          localField: 'teamId',
          foreignField: '_id',
          as: 'teamInfo'
        }
      },
      { $unwind: '$teamInfo' },
      {
        $project: {
          playerId: '$playerScores.playerId',
          playerName: '$playerScores.playerName',
          teamName: '$teamInfo.name',
          averageMarks: '$playerScores.averageMarks',
          seniorJudgeScore: '$playerScores.judgeScores.seniorJudge',
          time: '$playerScores.time',
          finalScore: '$playerScores.finalScore',
          ageGroup: 1,
          gender: 1,
          // Convert time to numeric value for sorting (assuming format like "1:30" or "90")
          timeNumeric: {
            $cond: {
              if: { $regexMatch: { input: '$playerScores.time', regex: /^\d+:\d+$/ } },
              then: {
                $add: [
                  { $multiply: [{ $toInt: { $arrayElemAt: [{ $split: ['$playerScores.time', ':'] }, 0] } }, 60] },
                  { $toInt: { $arrayElemAt: [{ $split: ['$playerScores.time', ':'] }, 1] } }
                ]
              },
              else: {
                $cond: {
                  if: { $regexMatch: { input: '$playerScores.time', regex: /^\d+$/ } },
                  then: { $toInt: '$playerScores.time' },
                  else: 999999 // Large number for invalid/empty times to sort them last
                }
              }
            }
          }
        }
      },
      {
        $sort: {
          averageMarks: -1,           // 1st priority: Highest average marks first
          seniorJudgeScore: -1,       // 2nd priority: If tie, highest senior judge score
          timeNumeric: 1              // 3rd priority: If still tie, lowest time (fastest)
        }
      }
    ]);

    console.log('Individual scores result:', individualScores.length, 'players found');
    res.json({ individualScores });
  } catch (error) {
    console.error('Get individual scores error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get submitted teams
const getSubmittedTeams = async (req, res) => {
  try {
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    const { ageGroup, gender } = req.query;

    const competitionTeams = await CompetitionTeam.find({
      competition: req.competitionId,
      isSubmitted: true,
      paymentStatus: 'completed',
      isActive: true
    })
      .populate('players.player', 'firstName lastName gender dateOfBirth')
      .populate('coach', 'name email')
      .populate('team', 'name description')
      .sort({ submittedAt: -1 });

    let filteredTeams = competitionTeams;

    if (ageGroup || gender) {
      filteredTeams = competitionTeams.filter(ct => {
        const teamPlayers = ct.players || [];
        if (ageGroup && gender) {
          return teamPlayers.some(p => p.ageGroup === ageGroup && p.gender === gender);
        }
        if (ageGroup) return teamPlayers.some(p => p.ageGroup === ageGroup);
        if (gender) return teamPlayers.some(p => p.gender === gender);
        return true;
      });
    }

    const formattedTeams = filteredTeams.map(ct => {
      const ageGroupSummary = {};
      (ct.players || []).forEach(p => {
        const key = `${p.gender} ${p.ageGroup}`;
        ageGroupSummary[key] = (ageGroupSummary[key] || 0) + 1;
      });
      return {
        _id: ct.team?._id,
        name: ct.team?.name,
        coach: ct.coach,
        players: ct.players,
        submittedAt: ct.submittedAt,
        paymentAmount: ct.paymentAmount,
        ageGroupSummary
      };
    });

    res.json({ teams: formattedTeams });
  } catch (error) {
    console.error('Get submitted teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Save judges
const saveJudges = async (req, res) => {
  try {
    const { gender, ageGroup, judges } = req.body;

    // Validate required fields
    if (!gender || !ageGroup || !judges || judges.length !== 5) {
      return res.status(400).json({ message: 'Invalid judge data provided' });
    }

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Check if judges already exist for this gender/age group/competition combination
    const existingJudges = await Judge.find({ 
      gender, 
      ageGroup,
      competition: req.competitionId 
    });
    if (existingJudges.length > 0) {
      return res.status(400).json({
        message: `Judges already exist for ${gender} ${ageGroup} in this competition. Use edit functionality to modify existing judges.`
      });
    }

    // Create all 5 judge records, handling empty ones properly
    const judgePromises = judges.map(judgeData => {
      const hasData = judgeData.name && judgeData.name.trim() && judgeData.password && judgeData.password.trim();

      const judgeDoc = {
        gender,
        ageGroup,
        judgeNo: judgeData.judgeNo,
        judgeType: judgeData.judgeType,
        name: hasData ? judgeData.name.trim() : '',
        password: hasData ? judgeData.password.trim() : '',
        isActive: Boolean(hasData),
        competition: req.competitionId // Associate with current competition
      };

      // Only set username if there's data to avoid unique constraint issues
      if (hasData && judgeData.username && judgeData.username.trim()) {
        judgeDoc.username = judgeData.username.trim();
      }

      const judge = new Judge(judgeDoc);
      return judge.save();
    });

    await Promise.all(judgePromises);

    const validJudgesCount = judges.filter(j => j.name && j.password).length;

    res.status(201).json({
      message: 'Judge panel created successfully',
      totalSlots: 5,
      filledSlots: validJudgesCount,
      emptySlots: 5 - validJudgesCount
    });
  } catch (error) {
    console.error('Save judges error:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Duplicate judge assignment or username already exists' });
    } else {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// Get judges
const getJudges = async (req, res) => {
  try {
    const { gender, ageGroup, judgeType } = req.query;

    if (!gender || !ageGroup) {
      return res.status(400).json({ message: 'Gender and age group are required' });
    }

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Build query with competition filter
    let query = { 
      gender, 
      ageGroup,
      competition: req.competitionId 
    };

    // Add filtering by judge type if provided
    if (judgeType) {
      query.judgeType = judgeType;
    }

    // Get existing judges for this gender/age group/competition
    const existingJudges = await Judge.find(query)
      .sort({ judgeNo: 1 });

    // If no judges exist at all, return empty array to allow creation
    if (existingJudges.length === 0) {
      return res.json({ judges: [] });
    }

    // Define the complete judge structure
    const judgeTypes = [
      { judgeNo: 1, judgeType: 'Senior Judge' },
      { judgeNo: 2, judgeType: 'Judge 1' },
      { judgeNo: 3, judgeType: 'Judge 2' },
      { judgeNo: 4, judgeType: 'Judge 3' },
      { judgeNo: 5, judgeType: 'Judge 4' }
    ];

    // Create complete judge panel (existing + empty slots)
    const completeJudgePanel = judgeTypes.map(template => {
      const existingJudge = existingJudges.find(j => j.judgeNo === template.judgeNo);

      if (existingJudge) {
        // Check if the existing judge is actually empty (inactive or no name)
        const isEmpty = !existingJudge.isActive || !existingJudge.name || !existingJudge.name.trim();

        if (isEmpty) {
          // Return as empty slot but keep the _id for updating
          return {
            _id: existingJudge._id,
            gender,
            ageGroup,
            judgeNo: template.judgeNo,
            judgeType: template.judgeType,
            name: '',
            username: '',
            password: '',
            isActive: false,
            createdAt: existingJudge.createdAt,
            isEmpty: true // Flag to indicate this is an empty slot
          };
        } else {
          // Return the active judge as-is
          return existingJudge;
        }
      } else {
        // Return a placeholder for empty slots
        return {
          _id: null,
          gender,
          ageGroup,
          judgeNo: template.judgeNo,
          judgeType: template.judgeType,
          name: '',
          username: '',
          password: '',
          isActive: false,
          createdAt: null,
          isEmpty: true // Flag to indicate this is an empty slot
        };
      }
    });

    res.json({ judges: completeJudgePanel });
  } catch (error) {
    console.error('Get judges error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create single judge
const createSingleJudge = async (req, res) => {
  try {
    const { gender, ageGroup, judgeNo, judgeType, name, username, password } = req.body;

    // Validate required fields
    if (!gender || !ageGroup || !judgeNo || !judgeType || !name || !username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Check if judge already exists for this position in current competition
    const existingJudge = await Judge.findOne({ 
      gender, 
      ageGroup, 
      judgeNo,
      competition: req.competitionId 
    });
    if (existingJudge && existingJudge.name && existingJudge.name.trim()) {
      return res.status(400).json({ message: 'Judge already exists for this position' });
    }

    // Check if username is already taken in current competition (exclude current judge if updating existing empty slot)
    const normalizedUsername = username.toLowerCase().trim();
    const usernameQuery = {
      username: normalizedUsername,
      isActive: true,
      competition: req.competitionId // Only check within current competition
    };

    // If updating an existing judge, exclude it from the check
    if (existingJudge && existingJudge._id) {
      usernameQuery._id = { $ne: existingJudge._id };
    }

    const existingUsername = await Judge.findOne(usernameQuery);
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists in this competition' });
    }

    let judge;
    if (existingJudge) {
      // Update existing empty judge
      existingJudge.name = name.trim();
      existingJudge.username = username.toLowerCase().trim();
      existingJudge.password = password.trim();
      existingJudge.isActive = true;
      judge = await existingJudge.save();
    } else {
      // Create new judge
      judge = new Judge({
        gender,
        ageGroup,
        judgeNo,
        judgeType,
        name: name.trim(),
        username: username.toLowerCase().trim(),
        password: password.trim(),
        isActive: true,
        competition: req.competitionId // Associate with current competition
      });
      await judge.save();
    }

    res.status(201).json({
      message: 'Judge created successfully',
      judge: {
        _id: judge._id,
        name: judge.name,
        username: judge.username,
        judgeType: judge.judgeType,
        gender: judge.gender,
        ageGroup: judge.ageGroup
      }
    });
  } catch (error) {
    console.error('Create single judge error:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Duplicate judge assignment or username already exists' });
    } else {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// Update judge
const updateJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    const { name, username, password } = req.body;

    // Validate required fields
    if (!name || !username || !password) {
      return res.status(400).json({ message: 'Name, username, and password are required' });
    }

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Check if judge exists and belongs to current competition
    const judge = await Judge.findOne({ 
      _id: judgeId,
      competition: req.competitionId 
    });
    if (!judge) {
      return res.status(404).json({ 
        message: 'Judge not found or does not belong to the current competition' 
      });
    }

    // Check if username is already taken by another judge in current competition
    const normalizedUsername = username.toLowerCase().trim();
    const usernameQuery = {
      username: normalizedUsername,
      _id: { $ne: judgeId },
      isActive: true,
      competition: req.competitionId // Only check within current competition
    };

    const existingUsernameJudge = await Judge.findOne(usernameQuery);
    if (existingUsernameJudge) {
      return res.status(400).json({ message: 'Username already exists in this competition' });
    }

    // Update judge
    judge.name = name.trim();
    judge.username = username.toLowerCase().trim();
    judge.password = password.trim(); // In production, this should be hashed
    judge.isActive = true; // Activate the judge when updated with valid data

    await judge.save();

    res.json({
      message: 'Judge updated successfully',
      judge: {
        _id: judge._id,
        name: judge.name,
        username: judge.username,
        judgeType: judge.judgeType,
        gender: judge.gender,
        ageGroup: judge.ageGroup,
        isActive: judge.isActive
      }
    });
  } catch (error) {
    console.error('Update judge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper function to determine if scores should be locked based on completeness
const determineIsLocked = (playerScores) => {
  // Check if all players have complete scores
  const allPlayersScored = playerScores.every(playerScore => {
    // Check if player has at least one judge score
    const hasJudgeScores = Object.values(playerScore.judgeScores || {}).some(score => score > 0);

    // Check if player has time value
    const hasTime = playerScore.time && playerScore.time.trim() !== '';

    return hasJudgeScores && hasTime;
  });

  return allPlayersScored && playerScores.length > 0;
};

// Save scores for a team's players
const saveScores = async (req, res) => {
  try {
    const { teamId, gender, ageGroup, timeKeeper, scorer, remarks, playerScores, isLocked } = req.body;

    // Validate required fields
    if (!teamId || !gender || !ageGroup || !playerScores || !Array.isArray(playerScores)) {
      return res.status(400).json({
        message: 'Team ID, gender, age group, and player scores are required'
      });
    }

    // Validate competition context is present
    if (!req.competitionId) {
      return res.status(400).json({ message: 'Competition context is required' });
    }

    // Check if competition is completed
    const competition = await Competition.findById(req.competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }
    
    if (competition.status === 'completed') {
      return res.status(403).json({ 
        message: 'Cannot add or update scores for a completed competition' 
      });
    }

    const competitionTeam = await CompetitionTeam.findOne({
      team: teamId,
      competition: req.competitionId,
      isActive: true
    }).populate('team', 'name');
    if (!competitionTeam || !competitionTeam.team) {
      return res.status(404).json({
        message: 'Team not found or does not belong to the current competition'
      });
    }

    // Check if scores already exist for this team, gender, age group, and competition
    let existingScore = await Score.findOne({ 
      teamId, 
      gender, 
      ageGroup,
      competition: req.competitionId 
    });

    // Check if existing score is locked before allowing updates
    if (existingScore && existingScore.isLocked) {
      return res.status(403).json({
        message: 'Cannot update scores - this entry is locked',
        isLocked: true
      });
    }

    // Determine lock state based on score completeness
    const shouldBeLocked = determineIsLocked(playerScores);

    if (existingScore) {
      // Update existing scores
      existingScore.timeKeeper = timeKeeper || '';
      existingScore.scorer = scorer || '';
      existingScore.remarks = remarks || '';
      existingScore.playerScores = playerScores;
      existingScore.isLocked = shouldBeLocked;
      existingScore.updatedAt = new Date();

      await existingScore.save();

      res.json({
        message: 'Scores updated successfully',
        scoreId: existingScore._id,
        playersScored: playerScores.length,
        isLocked: existingScore.isLocked
      });
    } else {
      // Create new score record
      const newScore = new Score({
        teamId,
        gender,
        ageGroup,
        timeKeeper: timeKeeper || '',
        scorer: scorer || '',
        remarks: remarks || '',
        playerScores,
        isLocked: shouldBeLocked,
        competition: req.competitionId // Associate with current competition
      });

      await newScore.save();

      res.status(201).json({
        message: 'Scores saved successfully',
        scoreId: newScore._id,
        playersScored: playerScores.length,
        isLocked: newScore.isLocked
      });
    }

    const io = req.app.get('io');
    if (io) {
      const roomId = `scoring_${gender}_${ageGroup}`;
      io.to(roomId).emit('scores_saved_notification', {
        teamId,
        teamName: competitionTeam.team?.name,
        gender,
        ageGroup,
        playersScored: playerScores.length
      });
    }

  } catch (error) {
    console.error('Save scores error:', error);
    res.status(500).json({ message: 'Server error while saving scores' });
  }
};

// Unlock scores for editing
const unlockScores = async (req, res) => {
  try {
    const { scoreId } = req.params;

    // Validate scoreId
    if (!scoreId) {
      return res.status(400).json({ message: 'Score ID is required' });
    }

    // Find the score document
    const score = await Score.findById(scoreId);

    if (!score) {
      return res.status(404).json({ message: 'Score record not found' });
    }

    // Update the lock state to false
    score.isLocked = false;
    score.updatedAt = new Date();

    await score.save();

    res.json({
      message: 'Scores unlocked successfully',
      scoreId: score._id,
      isLocked: score.isLocked
    });

  } catch (error) {
    console.error('Unlock scores error:', error);
    res.status(500).json({ message: 'Server error while unlocking scores' });
  }
};

// Save individual score from judge
const saveIndividualScore = async (req, res) => {
  try {
    const { playerId, playerName, judgeType, score, teamId, gender, ageGroup } = req.body;

    // Validate required fields
    if (!playerId || !judgeType || score === undefined || !teamId || !gender || !ageGroup) {
      return res.status(400).json({
        message: 'Player ID, judge type, score, team ID, gender, and age group are required'
      });
    }

    // Find or create score record for this team/gender/age group
    let scoreRecord = await Score.findOne({ teamId, gender, ageGroup });

    if (!scoreRecord) {
      // Create new score record
      scoreRecord = new Score({
        teamId,
        gender,
        ageGroup,
        playerScores: []
      });
    }

    // Find or create player score entry
    let playerScore = scoreRecord.playerScores.find(ps => ps.playerId.toString() === playerId);

    if (!playerScore) {
      // Create new player score entry
      playerScore = {
        playerId,
        playerName: playerName || 'Unknown Player',
        judgeScores: {
          seniorJudge: 0,
          judge1: 0,
          judge2: 0,
          judge3: 0,
          judge4: 0
        },
        averageMarks: 0,
        deduction: 0,
        otherDeduction: 0,
        finalScore: 0
      };
      scoreRecord.playerScores.push(playerScore);
    }

    // Update the specific judge score
    switch (judgeType) {
      case 'Senior Judge':
        playerScore.judgeScores.seniorJudge = parseFloat(score);
        break;
      case 'Judge 1':
        playerScore.judgeScores.judge1 = parseFloat(score);
        break;
      case 'Judge 2':
        playerScore.judgeScores.judge2 = parseFloat(score);
        break;
      case 'Judge 3':
        playerScore.judgeScores.judge3 = parseFloat(score);
        break;
      case 'Judge 4':
        playerScore.judgeScores.judge4 = parseFloat(score);
        break;
    }

    // Recalculate average and final score using trimmed mean (remove highest and lowest)
    const judgeScores = Object.values(playerScore.judgeScores).filter(s => s > 0);
    if (judgeScores.length > 0) {
      let averageScore;

      // If we have 3 or fewer scores, use all of them
      if (judgeScores.length <= 3) {
        averageScore = judgeScores.reduce((sum, s) => sum + s, 0) / judgeScores.length;
      } else {
        // If we have 4 or more scores, remove highest and lowest
        const sortedScores = [...judgeScores].sort((a, b) => a - b);
        // Remove the lowest (first) and highest (last) scores
        const trimmedScores = sortedScores.slice(1, -1);
        averageScore = trimmedScores.reduce((sum, s) => sum + s, 0) / trimmedScores.length;
      }

      playerScore.averageMarks = parseFloat(averageScore.toFixed(2));
      playerScore.finalScore = Math.max(0, playerScore.averageMarks - playerScore.deduction - playerScore.otherDeduction);
    }

    await scoreRecord.save();

    // Emit real-time update via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      const roomId = `scoring_${gender}_${ageGroup}`;
      io.to(roomId).emit('score_updated', {
        playerId,
        playerName: playerName || 'Unknown Player',
        judgeType,
        score: parseFloat(score),
        roomId
      });
      console.log('Individual score update broadcasted:', { playerId, judgeType, score });
    }

    res.json({
      message: 'Score saved successfully',
      playerId,
      judgeType,
      score: parseFloat(score)
    });

  } catch (error) {
    console.error('Save individual score error:', error);
    res.status(500).json({ message: 'Server error while saving score' });
  }
};

// Get team rankings based on top 3 player scores per team
const getTeamRankings = async (req, res) => {
  try {
    const { ageGroup, gender } = req.query;

    let matchQuery = {};
    if (ageGroup) matchQuery.ageGroup = ageGroup;
    if (gender) matchQuery.gender = gender;

    // First, let's check if we have any scores at all
    const totalScores = await Score.countDocuments(matchQuery);

    if (totalScores === 0) {
      return res.json({ teamRankings: [] });
    }

    const teamRankings = await Score.aggregate([
      { $match: matchQuery },
      { $unwind: '$playerScores' },
      {
        $lookup: {
          from: 'teams',
          localField: 'teamId',
          foreignField: '_id',
          as: 'teamInfo'
        }
      },
      { $unwind: '$teamInfo' },
      {
        $group: {
          _id: {
            teamId: '$teamId',
            teamName: '$teamInfo.name'
          },
          playerScores: {
            $push: {
              playerId: '$playerScores.playerId',
              playerName: '$playerScores.playerName',
              finalScore: '$playerScores.finalScore',
              averageMarks: '$playerScores.averageMarks',
              time: '$playerScores.time'
            }
          },
          gender: { $first: '$gender' },
          ageGroup: { $first: '$ageGroup' }
        }
      },
      {
        $addFields: {
          // Sort player scores by finalScore descending and take top 3
          topPlayerScores: {
            $slice: [
              {
                $sortArray: {
                  input: '$playerScores',
                  sortBy: { finalScore: -1 }
                }
              },
              3
            ]
          }
        }
      },
      {
        $addFields: {
          // Sum the top 3 scores (or whatever is available if less than 3)
          teamTotalScore: {
            $sum: '$topPlayerScores.finalScore'
          },
          playerCount: { $size: '$topPlayerScores' },
          averageTeamScore: {
            $cond: {
              if: { $gt: [{ $size: '$topPlayerScores' }, 0] },
              then: {
                $divide: [
                  { $sum: '$topPlayerScores.finalScore' },
                  { $size: '$topPlayerScores' }
                ]
              },
              else: 0
            }
          }
        }
      },
      {
        $project: {
          teamId: '$_id.teamId',
          teamName: '$_id.teamName',
          teamTotalScore: 1,
          averageTeamScore: { $round: ['$averageTeamScore', 2] },
          playerCount: 1,
          topPlayerScores: 1,
          gender: 1,
          ageGroup: 1
        }
      },
      {
        $sort: {
          teamTotalScore: -1,      // Primary: Highest total score
          averageTeamScore: -1,    // Secondary: Highest average if tied
          playerCount: -1          // Tertiary: More players if still tied
        }
      }
    ]);

    console.log('Team rankings result:', teamRankings.length, 'teams found');
    res.json({ teamRankings });
  } catch (error) {
    console.error('Get team rankings error:', error);
    res.status(500).json({ message: 'Server error while fetching team rankings', error: error.message });
  }
};

// Get public teams (for score viewing)
const getPublicTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isSubmitted: true })
      .populate('coach', 'name email')
      .populate('players.player', 'firstName lastName gender dateOfBirth')
      .select('name coach players')
      .sort({ name: 1 });

    res.json({
      success: true,
      teams
    });
  } catch (error) {
    console.error('Error fetching public teams:', error);
    res.status(500).json({ message: 'Server error fetching teams' });
  }
};

// Get public scores (for score viewing)
const getPublicScores = async (req, res) => {
  try {
    const { teamId, gender, ageGroup } = req.query;

    if (!teamId || !gender || !ageGroup) {
      return res.status(400).json({ 
        message: 'Team ID, gender, and age group are required' 
      });
    }

    // Validate teamId
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team ID format' });
    }

    const teamObjectId = convertToObjectId(teamId);

    // Find scores for the specific team, gender, and age group
    const scores = await Score.find({
      teamId: teamObjectId,
      gender,
      ageGroup,
      isLocked: true // Only show locked (finalized) scores
    })
    .populate('teamId', 'name')
    .sort({ createdAt: -1 });

    if (!scores || scores.length === 0) {
      return res.json({
        success: true,
        scores: [],
        message: 'No scores found for this team and category'
      });
    }

    // Format the response
    const formattedScores = scores.map(score => ({
      _id: score._id,
      teamName: score.teamId.name,
      gender: score.gender,
      ageGroup: score.ageGroup,
      playerScores: score.playerScores.map(player => ({
        playerId: player.playerId,
        playerName: player.playerName,
        time: player.time,
        judgeScores: player.judgeScores,
        averageMarks: player.averageMarks,
        deduction: player.deduction,
        otherDeduction: player.otherDeduction,
        finalScore: player.finalScore
      })),
      timeKeeper: score.timeKeeper,
      scorer: score.scorer,
      remarks: score.remarks,
      createdAt: score.createdAt,
      updatedAt: score.updatedAt
    }));

    res.json({
      success: true,
      scores: formattedScores
    });
  } catch (error) {
    console.error('Error fetching public scores:', error);
    res.status(500).json({ message: 'Server error fetching scores' });
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getDashboardStats,
  getAllTeams,
  getTeamDetails,
  getAllPlayers,
  addScore,
  getTeamScores,
  getIndividualScores,
  getSubmittedTeams,
  saveJudges,
  getJudges,
  createSingleJudge,
  updateJudge,
  saveScores,
  unlockScores,
  saveIndividualScore,
  getTeamRankings,
  getPublicTeams,
  getPublicScores
};