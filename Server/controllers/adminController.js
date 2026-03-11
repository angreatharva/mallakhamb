const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Coach = require('../models/Coach');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const Transaction = require('../models/Transaction');
const { generateToken } = require('../utils/tokenUtils');
const scoringUtils = require('../utils/scoringUtils');
const bcrypt = require('bcryptjs');

/**
 * Admin Registration
 */
const registerAdmin = async (req, res) => {
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

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    // Create new admin
    const admin = new Admin({
      name,
      email,
      password,
      role: 'admin'
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

/**
 * Admin Login
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email, role: 'admin' });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(admin._id, 'admin');

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
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * Get Admin Profile
 */
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

/**
 * Get Dashboard Stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const competitionId = req.competitionId;

    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const totalTeams = competition.registeredTeams.length;
    const totalPlayers = await Player.countDocuments({ competition: competitionId });
    const totalJudges = await Judge.countDocuments({ competition: competitionId, isActive: true });

    res.json({
      stats: {
        totalTeams,
        totalPlayers,
        totalJudges
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get All Teams
 */
const getAllTeams = async (req, res) => {
  try {
    const competitionId = req.competitionId;

    const competition = await Competition.findById(competitionId)
      .populate('registeredTeams.coach', 'name email')
      .populate('registeredTeams.team', 'name description')
      .populate('registeredTeams.players.player', 'firstName lastName gender');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Transform to match expected format
    const teams = competition.registeredTeams.map(rt => ({
      _id: rt._id,
      team: rt.team,
      coach: rt.coach,
      players: rt.players,
      isSubmitted: rt.isSubmitted,
      submittedAt: rt.submittedAt,
      paymentStatus: rt.paymentStatus,
      paymentAmount: rt.paymentAmount,
      isActive: rt.isActive,
      createdAt: rt.createdAt || competition.createdAt
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ teams });
  } catch (error) {
    console.error('Get all teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Team Details
 */
const getTeamDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    const competitionId = req.competitionId;

    const competition = await Competition.findById(competitionId)
      .populate('registeredTeams.coach', 'name email phone')
      .populate('registeredTeams.team', 'name description')
      .populate('registeredTeams.players.player', 'firstName lastName gender dateOfBirth');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const team = competition.registeredTeams.id(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Submitted Teams
 */
const getSubmittedTeams = async (req, res) => {
  try {
    const { sanitizeQueryParam } = require('../utils/sanitization');
    
    // Sanitize query parameters to prevent NoSQL injection
    const gender = sanitizeQueryParam(req.query.gender);
    const ageGroup = sanitizeQueryParam(req.query.ageGroup);
    const competitionType = sanitizeQueryParam(req.query.competitionType);
    
    let competitionId = req.competitionId;

    // For public routes without competition ID, try to find an active competition
    if (!competitionId) {
      const activeCompetition = await Competition.findOne({ 
        status: { $in: ['upcoming', 'ongoing'] },
        isDeleted: false 
      }).sort({ startDate: -1 });
      
      if (activeCompetition) {
        competitionId = activeCompetition._id;
      } else {
        return res.status(400).json({ 
          message: 'No active competition found. Please contact the administrator.' 
        });
      }
    }

    const competition = await Competition.findById(competitionId)
      .populate('registeredTeams.team', 'name description')
      .populate('registeredTeams.coach', 'name email')
      .populate('registeredTeams.players.player', 'firstName lastName gender');

    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Filter submitted teams
    const submittedTeams = competition.registeredTeams.filter(rt => rt.isSubmitted);

    // Filter teams that have players matching the gender and age group
    const filteredTeams = submittedTeams.map(rt => {
      const matchingPlayers = rt.players.filter(p =>
        p.player.gender === gender && p.ageGroup === ageGroup
      );

      return {
        _id: rt._id,
        name: rt.team?.name || 'Unnamed Team',
        description: rt.team?.description,
        coach: rt.coach,
        team: rt.team,
        players: matchingPlayers.map(p => ({
          player: p.player,
          ageGroup: p.ageGroup,
          gender: p.gender
        })),
        playerCount: matchingPlayers.length,
        isSubmitted: rt.isSubmitted,
        submittedAt: rt.submittedAt
      };
    }).filter(team => team.playerCount > 0)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    res.json({ teams: filteredTeams });
  } catch (error) {
    console.error('Get submitted teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add Score (Legacy - kept for compatibility)
 */
const addScore = async (req, res) => {
  try {
    const scoreData = req.body;
    scoreData.competition = req.competitionId;

    const score = new Score(scoreData);
    await score.save();

    res.status(201).json({
      message: 'Score added successfully',
      score
    });
  } catch (error) {
    console.error('Add score error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Save Scores with new calculation logic
 */
const saveScores = async (req, res) => {
  try {
    const {
      teamId,
      teamName,
      coachName,
      coachEmail,
      gender,
      ageGroup,
      competitionType = 'Competition I', // Default to Competition I
      timeKeeper,
      scorer,
      remarks,
      isLocked,
      playerScores,
      judgeDetails
    } = req.body;

    const competitionId = req.competitionId;

    console.log('💾 Saving scores:', {
      teamId,
      gender,
      ageGroup,
      competitionType,
      playerCount: playerScores?.length,
      isLocked
    });

    // Validate required fields
    if (!teamId || !gender || !ageGroup || !playerScores) {
      return res.status(400).json({
        message: 'Missing required fields: teamId, gender, ageGroup, playerScores'
      });
    }

    // Process each player score with new calculation logic
    const processedPlayerScores = playerScores.map(player => {
      // Calculate score using new logic
      const calculationResult = scoringUtils.calculateScore(player.judgeScores);
      
      // Calculate final score with deductions
      const finalScore = scoringUtils.calculateFinalScore(
        calculationResult.averageMarks,
        player.deduction || 0,
        player.otherDeduction || 0
      );

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        time: player.time || '',
        judgeScores: player.judgeScores,
        executionAverage: calculationResult.executionAverage,
        baseScore: calculationResult.baseScore,
        baseScoreApplied: calculationResult.baseScoreApplied,
        toleranceUsed: calculationResult.toleranceUsed,
        averageMarks: calculationResult.averageMarks,
        deduction: player.deduction || 0,
        otherDeduction: player.otherDeduction || 0,
        finalScore: finalScore
      };
    });

    // Find existing score or create new one
    let scoreRecord = await Score.findOne({
      teamId,
      gender,
      ageGroup,
      competition: competitionId
    });

    if (scoreRecord) {
      // Update existing score
      scoreRecord.competitionType = competitionType;
      scoreRecord.timeKeeper = timeKeeper || '';
      scoreRecord.scorer = scorer || '';
      scoreRecord.remarks = remarks || '';
      scoreRecord.isLocked = isLocked;
      scoreRecord.playerScores = processedPlayerScores;
      scoreRecord.updatedAt = Date.now();
    } else {
      // Create new score
      scoreRecord = new Score({
        competition: competitionId,
        teamId,
        gender,
        ageGroup,
        competitionType,
        timeKeeper: timeKeeper || '',
        scorer: scorer || '',
        remarks: remarks || '',
        isLocked,
        playerScores: processedPlayerScores
      });
    }

    await scoreRecord.save();

    console.log('✅ Scores saved successfully:', scoreRecord._id);

    res.json({
      message: 'Scores saved successfully',
      scoreId: scoreRecord._id,
      isLocked: scoreRecord.isLocked,
      playerScores: scoreRecord.playerScores
    });
  } catch (error) {
    console.error('❌ Save scores error:', error);
    res.status(500).json({
      message: 'Server error while saving scores',
      error: error.message
    });
  }
};

/**
 * Unlock Scores
 */
const unlockScores = async (req, res) => {
  try {
    const { scoreId } = req.params;
    const competitionId = req.competitionId;

    const score = await Score.findOne({
      _id: scoreId,
      competition: competitionId
    });

    if (!score) {
      return res.status(404).json({ message: 'Score not found' });
    }

    score.isLocked = false;
    score.updatedAt = Date.now();
    await score.save();

    res.json({
      message: 'Scores unlocked successfully',
      score
    });
  } catch (error) {
    console.error('Unlock scores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Team Scores
 */
const getTeamScores = async (req, res) => {
  try {
    const { teamId, gender, ageGroup } = req.query;
    const competitionId = req.competitionId;

    const query = { competition: competitionId };
    if (teamId) query.teamId = teamId;
    if (gender) query.gender = gender;
    if (ageGroup) query.ageGroup = ageGroup;

    const scores = await Score.find(query)
      .populate('teamId', 'name')
      .sort({ updatedAt: -1 });

    res.json({ scores });
  } catch (error) {
    console.error('Get team scores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Individual Scores with Tie-Breaker
 */
const getIndividualScores = async (req, res) => {
  try {
    const { gender, ageGroup } = req.query;
    const competitionId = req.competitionId;

    if (!gender || !ageGroup) {
      return res.status(400).json({ message: 'Gender and age group are required' });
    }

    const scores = await Score.find({
      competition: competitionId,
      gender,
      ageGroup,
      isLocked: true
    });

    // Flatten player scores
    const allPlayers = [];
    scores.forEach(scoreEntry => {
      scoreEntry.playerScores.forEach(player => {
        allPlayers.push({
          ...player.toObject(),
          teamName: scoreEntry.teamId?.name || 'Unknown Team',
          teamId: scoreEntry.teamId?._id || null,
          competitionType: scoreEntry.competitionType
        });
      });
    });

    // Apply tie-breaker logic
    const competitionType = scores[0]?.competitionType || 'Competition II';
    const rankedPlayers = scoringUtils.applyTieBreaker(allPlayers, competitionType);

    res.json({ individualScores: rankedPlayers });
  } catch (error) {
    console.error('Get individual scores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Team Rankings
 */
const getTeamRankings = async (req, res) => {
  try {
    const { gender, ageGroup } = req.query;
    const competitionId = req.competitionId;

    if (!gender || !ageGroup) {
      return res.status(400).json({ message: 'Gender and age group are required' });
    }

    const scores = await Score.find({
      competition: competitionId,
      gender,
      ageGroup,
      isLocked: true
    }).populate('teamId', 'name');

    // Calculate team rankings (top 5 players per team)
    const teamRankings = scores.map(scoreEntry => {
      const sortedPlayers = [...scoreEntry.playerScores]
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5); // Top 5 players

      const totalScore = sortedPlayers.reduce((sum, p) => sum + p.finalScore, 0);
      const averageScore = sortedPlayers.length > 0 ? totalScore / sortedPlayers.length : 0;

      return {
        teamId: scoreEntry.teamId._id,
        teamName: scoreEntry.teamId.name,
        totalScore: parseFloat(totalScore.toFixed(2)),
        averageScore: parseFloat(averageScore.toFixed(2)),
        playerCount: sortedPlayers.length,
        topPlayers: sortedPlayers.map(p => ({
          playerName: p.playerName,
          finalScore: p.finalScore
        }))
      };
    }).sort((a, b) => b.totalScore - a.totalScore);

    // Add ranks (no tie-breaker for team rankings)
    const rankedTeams = teamRankings.map((team, index) => ({
      ...team,
      rank: index + 1
    }));

    res.json({ teamRankings: rankedTeams });
  } catch (error) {
    console.error('Get team rankings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get All Players
 */
const getAllPlayers = async (req, res) => {
  try {
    const competitionId = req.competitionId;

    const players = await Player.find({ competition: competitionId })
      .populate('coach', 'name email')
      .sort({ createdAt: -1 });

    res.json({ players });
  } catch (error) {
    console.error('Get all players error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Save Judges
 */
const saveJudges = async (req, res) => {
  try {
    const { judges, gender, ageGroup, competitionTypes } = req.body;
    const competitionId = req.competitionId;

    // Validate required fields
    if (!judges || !Array.isArray(judges) || judges.length === 0) {
      return res.status(400).json({ 
        message: 'Judges array is required and must not be empty',
        details: 'judges must be an array with at least one judge'
      });
    }

    if (!gender || !ageGroup) {
      return res.status(400).json({ 
        message: 'Gender and age group are required',
        details: 'Both gender and ageGroup fields must be provided'
      });
    }

    if (!competitionTypes || !Array.isArray(competitionTypes) || competitionTypes.length === 0) {
      return res.status(400).json({ 
        message: 'Competition types are required',
        details: 'At least one competition type must be selected'
      });
    }

    if (!competitionId) {
      return res.status(400).json({ 
        message: 'Competition context is required',
        details: 'competitionId must be present in request'
      });
    }

    // Check if any of the competition types have been started
    const Competition = require('../models/Competition');
    const competition = await Competition.findById(competitionId);
    
    if (competition) {
      const hasStartedCompType = competitionTypes.some(compType => 
        competition.startedAgeGroups.some(
          started => started.gender === gender && 
                     started.ageGroup === ageGroup && 
                     started.competitionType === compType
        )
      );

      if (hasStartedCompType) {
        return res.status(400).json({ 
          message: 'Cannot save judges. One or more selected competition types for this age group have already started.' 
        });
      }
    }

    // Filter out empty judges (judges with no name, username, or password)
    const validJudges = judges.filter(judge => 
      judge.name && judge.name.trim() !== '' && 
      judge.username && judge.username.trim() !== ''
    );

    // Validate judge count (minimum 3, maximum 5)
    if (validJudges.length < 3) {
      return res.status(400).json({
        message: 'Insufficient judges',
        details: 'At least 3 judges are required (1 Senior Judge + 2 Judges)'
      });
    }

    if (validJudges.length > 5) {
      return res.status(400).json({
        message: 'Too many judges',
        details: 'Maximum 5 judges allowed (1 Senior Judge + 4 Judges)'
      });
    }

    // Validate each valid judge has required fields
    for (let i = 0; i < validJudges.length; i++) {
      const judge = validJudges[i];
      if (!judge.judgeType) {
        return res.status(400).json({
          message: `Invalid judge data`,
          details: 'Each judge must have judgeType'
        });
      }
    }

    // Use MongoDB session for atomic operations to prevent TOCTOU race
    const session = await Judge.startSession();
    session.startTransaction();

    try {
      // Check if judges already exist for this exact combination (within transaction)
      const existingJudgesCheck = await Judge.findOne({
        competition: competitionId,
        gender,
        ageGroup,
        competitionTypes: { $in: competitionTypes }
      }).session(session);

      if (existingJudgesCheck) {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Judges already exist for this combination',
          details: `Judge panel already exists for ${gender} - ${ageGroup} with the selected competition type(s). Please use Judge List to edit existing judges.`
        });
      }

      const createdJudges = [];
      const updatedJudges = [];
      const errors = [];

      // Process each valid judge
      for (const judgeData of validJudges) {
        try {
          // Check if judge already exists with same username for this competition (within transaction)
          const existingJudge = await Judge.findOne({
            competition: competitionId,
            username: judgeData.username,
            gender,
            ageGroup,
            competitionTypes: { $in: competitionTypes }
          }).session(session);

          if (existingJudge) {
            // Update existing judge
            existingJudge.name = judgeData.name;
            existingJudge.judgeType = judgeData.judgeType;
            existingJudge.judgeNo = judgeData.judgeNo || existingJudge.judgeNo;
            existingJudge.isActive = judgeData.isActive !== undefined ? judgeData.isActive : true;
            
            if (judgeData.password) {
              existingJudge.password = judgeData.password;
            }

            await existingJudge.save({ session });
            updatedJudges.push(existingJudge);
          } else {
            // Create new judge with secure temporary password
            const crypto = require('crypto');
            
            // Generate cryptographically secure temporary password if not provided
            let temporaryPassword = judgeData.password;
            let mustResetPassword = false;
            
            if (!temporaryPassword) {
              // Generate secure random password: 16 bytes = 32 hex characters
              temporaryPassword = crypto.randomBytes(16).toString('hex');
              mustResetPassword = true;
            }
            
            const newJudge = new Judge({
              competition: competitionId,
              name: judgeData.name,
              username: judgeData.username,
              password: temporaryPassword, // Will be hashed by Judge model pre-save hook
              judgeType: judgeData.judgeType,
              judgeNo: judgeData.judgeNo,
              gender,
              ageGroup,
              competitionTypes: competitionTypes,
              isActive: judgeData.isActive !== undefined ? judgeData.isActive : true,
              mustResetPassword: mustResetPassword // Flag to enforce password change at first login
            });

            await newJudge.save({ session });
            createdJudges.push(newJudge);
          }
        } catch (judgeError) {
          console.error(`Error processing judge ${judgeData.username}:`, judgeError);
          errors.push({
            username: judgeData.username,
            error: judgeError.message
          });
        }
      }

      // Calculate filled and empty slots based on final state
      // Get all existing judges for this combination (within transaction)
      const existingJudges = await Judge.find({
        competition: competitionId,
        gender,
        ageGroup,
        competitionTypes: { $in: competitionTypes }
      }).session(session);

      // Build set of final valid judges (existing + created, excluding failed)
      const failedUsernames = new Set(errors.map(e => e.username));
      const finalValidJudges = existingJudges.filter(j => !failedUsernames.has(j.username));
      
      const filledSlots = finalValidJudges.length;
      const emptySlots = Math.max(0, 5 - filledSlots); // Maximum 5 judges allowed

      // Commit transaction
      await session.commitTransaction();

      // Return response with counts and any errors
      res.json({
        message: 'Judges processed successfully',
        created: createdJudges.length,
        updated: updatedJudges.length,
        filledSlots: filledSlots,
        emptySlots: emptySlots,
        errors: errors.length > 0 ? errors : undefined,
        judges: [...createdJudges, ...updatedJudges].map(j => ({
          id: j._id,
          name: j.name,
          username: j.username,
          judgeType: j.judgeType,
          judgeNo: j.judgeNo,
          isActive: j.isActive,
          competitionTypes: j.competitionTypes
        }))
      });
    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Save judges error:', error);
    res.status(500).json({ 
      message: 'Server error while saving judges',
      error: error.message
    });
  }
};

/**
 * Get Judges
 */
const getJudges = async (req, res) => {
  try {
    const { gender, ageGroup, competitionType, competitionTypes, competition } = req.query;
    let competitionId = req.competitionId || competition;

    // Debug logging only in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('=== GET JUDGES DEBUG ===');
      console.log('Query params:', { gender, ageGroup, competitionType, competitionTypes, competition });
      console.log('req.competitionId:', req.competitionId);
      console.log('Is public route:', !req.competitionId);
    }

    // For public routes without competition ID, try to find an active competition
    if (!competitionId) {
      const Competition = require('../models/Competition');
      const activeCompetition = await Competition.findOne({ 
        status: { $in: ['upcoming', 'ongoing'] },
        isDeleted: false 
      }).sort({ startDate: -1 });
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Active competition found:', activeCompetition ? activeCompetition._id : 'NONE');
      }
      
      if (activeCompetition) {
        competitionId = activeCompetition._id;
      } else {
        return res.status(400).json({ 
          message: 'No active competition found. Please contact the administrator.' 
        });
      }
    }

    // Base query for fetching judges
    const query = { competition: competitionId };
    if (gender) query.gender = gender;
    if (ageGroup) query.ageGroup = ageGroup;
    
    // Filter by competition type (single) or competition types (multiple)
    // Use $in operator since competitionTypes is an array in the Judge model
    if (competitionType) {
      query.competitionTypes = { $in: [competitionType] };
    } else if (competitionTypes) {
      const typesArray = Array.isArray(competitionTypes) 
        ? competitionTypes 
        : competitionTypes.split(',');
      query.competitionTypes = { $in: typesArray };
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Judge query:', JSON.stringify(query, null, 2));
    }

    // For admin routes (where competition context middleware sets req.competitionId),
    // only include active judges. For public routes, include all judges so that
    // older records without isActive flag set are still visible.
    if (req.competitionId) {
      query.isActive = true;
    }

    const judges = await Judge.find(query).sort({ judgeNo: 1 });
    console.log('Judges found:', judges.length);
    judges.forEach(j => {
      console.log(`  - ${j.name} (${j.judgeType}) - competitionTypes: ${j.competitionTypes.join(', ')}`);
    });

    // DEBUG: Check if there are ANY judges for this gender/ageGroup/competitionType regardless of competition
    const allJudgesDebug = await Judge.find({
      gender: gender,
      ageGroup: ageGroup,
      competitionTypes: { $in: [competitionType] }
    });
    console.log('DEBUG: Total judges matching gender/age/type (any competition):', allJudgesDebug.length);
    allJudgesDebug.forEach(j => {
      console.log(`  - ${j.name} (${j.judgeType}) - competition: ${j.competition}`);
    });

    // For public routes (judge scoring), only return actual judges with data
    // Check if this is a public route by seeing if req.competitionId exists
    if (!req.competitionId) {
      // Filter out judges without names (empty judges)
      const activeJudges = judges.filter(j => j.name && j.name.trim() !== '');
      console.log('Active judges (filtered):', activeJudges.length);
      console.log('=== END DEBUG ===');
      return res.json({ judges: activeJudges });
    }

    // For admin routes, create all 5 judge slots (1-5)
    // Use cached template for better performance
    const JUDGE_SLOTS_TEMPLATE = [
      { judgeNo: 1, judgeType: 'Senior Judge', isEmpty: true },
      { judgeNo: 2, judgeType: 'Judge 1', isEmpty: true },
      { judgeNo: 3, judgeType: 'Judge 2', isEmpty: true },
      { judgeNo: 4, judgeType: 'Judge 3', isEmpty: true },
      { judgeNo: 5, judgeType: 'Judge 4', isEmpty: true }
    ];
    
    const allJudgeSlots = JUDGE_SLOTS_TEMPLATE.map(slot => {
      const existingJudge = judges.find(j => j.judgeNo === slot.judgeNo);
      
      if (existingJudge) {
        // Judge exists, return the actual judge data
        return {
          _id: existingJudge._id,
          judgeNo: existingJudge.judgeNo,
          judgeType: existingJudge.judgeType,
          name: existingJudge.name,
          username: existingJudge.username,
          gender: existingJudge.gender,
          ageGroup: existingJudge.ageGroup,
          competitionTypes: existingJudge.competitionTypes,
          isActive: existingJudge.isActive,
          isEmpty: false
        };
      } else {
        // Judge doesn't exist, create empty slot placeholder
        return {
          judgeNo: slot.judgeNo,
          judgeType: slot.judgeType,
          name: '',
          username: '',
          gender: gender || '',
          ageGroup: ageGroup || '',
          competitionTypes: competitionType ? [competitionType] : (competitionTypes ? (Array.isArray(competitionTypes) ? competitionTypes : competitionTypes.split(',')) : []),
          isEmpty: true
        };
      }
    });

    console.log('=== END DEBUG ===');
    res.json({ judges: allJudgeSlots });
  } catch (error) {
    console.error('Get judges error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create Single Judge
 */
const createSingleJudge = async (req, res) => {
  try {
    const judgeData = req.body;
    judgeData.competition = req.competitionId;

    // Password will be hashed by the pre-save hook in Judge model
    const judge = new Judge(judgeData);
    await judge.save();

    // Remove password from response
    const judgeResponse = judge.toObject();
    delete judgeResponse.password;

    res.status(201).json({
      message: 'Judge created successfully',
      judge: judgeResponse
    });
  } catch (error) {
    console.error('Create judge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update Judge
 */
const updateJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    const updateData = req.body;
    const competitionId = req.competitionId;

    // First, get the judge to check their current assignment
    const judge = await Judge.findOne({ _id: judgeId, competition: competitionId });
    
    if (!judge) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    // Check if any of the judge's competition types have been started
    const Competition = require('../models/Competition');
    const competition = await Competition.findById(competitionId);
    
    if (competition) {
      const hasStartedCompType = judge.competitionTypes.some(compType => 
        competition.startedAgeGroups.some(
          started => started.gender === judge.gender && 
                     started.ageGroup === judge.ageGroup && 
                     started.competitionType === compType
        )
      );

      if (hasStartedCompType) {
        return res.status(400).json({ 
          message: 'Cannot modify judge. One or more competition types for this age group have already started.' 
        });
      }
    }

    // Update judge fields with whitelist to prevent mass-assignment
    const allowedFields = ['name', 'username', 'judgeType', 'judgeNo', 'gender', 'ageGroup', 'competitionTypes', 'isActive', 'password', 'mustResetPassword'];
    allowedFields.forEach(field => {
      if (updateData.hasOwnProperty(field)) {
        judge[field] = updateData[field];
      }
    });

    // Save will trigger pre-save hook to hash password if it was modified
    await judge.save();

    // Remove password from response
    const judgeResponse = judge.toObject();
    delete judgeResponse.password;

    res.json({
      message: 'Judge updated successfully',
      judge: judgeResponse
    });
  } catch (error) {
    console.error('Update judge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete Judge
 */
const deleteJudge = async (req, res) => {
  try {
    const { judgeId } = req.params;
    const competitionId = req.competitionId;

    // First, get the judge to check their current assignment
    const judge = await Judge.findOne({ _id: judgeId, competition: competitionId });

    if (!judge) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    // Check if any of the judge's competition types have been started
    const Competition = require('../models/Competition');
    const competition = await Competition.findById(competitionId);
    
    if (competition) {
      const hasStartedCompType = judge.competitionTypes.some(compType => 
        competition.startedAgeGroups.some(
          started => started.gender === judge.gender && 
                     started.ageGroup === judge.ageGroup && 
                     started.competitionType === compType
        )
      );

      if (hasStartedCompType) {
        return res.status(400).json({ 
          message: 'Cannot delete judge. One or more competition types for this age group have already started.' 
        });
      }
    }

    // Delete the judge
    await Judge.findOneAndDelete({ _id: judgeId, competition: competitionId });

    res.json({ message: 'Judge deleted successfully' });
  } catch (error) {
    console.error('Delete judge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get All Judges Summary
 */
const getAllJudgesSummary = async (req, res) => {
  try {
    const competitionId = req.competitionId;

    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Get all judges for this competition
    const Judge = require('../models/Judge');
    const judges = await Judge.find({ competition: competitionId });

    const summary = competition.ageGroups.map(ag => {
      // Get judges for this age group
      const ageGroupJudges = judges.filter(
        j => j.gender === ag.gender && j.ageGroup === ag.ageGroup
      );

      // Group judges by competition type
      const competitionTypeGroups = {};
      competition.competitionTypes.forEach(compType => {
        const compTypeJudges = ageGroupJudges.filter(j => 
          j.competitionTypes.includes(compType)
        );
        
        // Check if this specific competition type is started
        const isStarted = competition.startedAgeGroups.some(
          started => started.gender === ag.gender && 
                     started.ageGroup === ag.ageGroup && 
                     started.competitionType === compType
        );
        
        competitionTypeGroups[compType] = {
          judges: compTypeJudges.map(j => ({
            name: j.name || 'Not assigned',
            judgeType: j.judgeType
          })),
          hasMinimumJudges: compTypeJudges.length >= 3,
          isStarted
        };
      });

      return {
        gender: ag.gender,
        ageGroup: ag.ageGroup,
        competitionTypes: competitionTypeGroups
      };
    });

    res.json({ summary });
  } catch (error) {
    console.error('Get judges summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Start Age Group
 */
const startAgeGroup = async (req, res) => {
  try {
    const { gender, ageGroup, competitionType } = req.body;
    const competitionId = req.competitionId;

    if (!competitionType) {
      return res.status(400).json({ message: 'Competition type is required' });
    }

    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Check if already started
    const alreadyStarted = competition.startedAgeGroups.some(
      started => started.gender === gender && 
                 started.ageGroup === ageGroup && 
                 started.competitionType === competitionType
    );

    if (alreadyStarted) {
      return res.status(400).json({ message: 'Competition type for this age group already started' });
    }

    // Verify this competition type exists in the competition
    if (!competition.competitionTypes.includes(competitionType)) {
      return res.status(400).json({ message: 'Invalid competition type for this competition' });
    }

    // Check if minimum judges are assigned for this specific competition type
    const Judge = require('../models/Judge');
    const judges = await Judge.find({
      competition: competitionId,
      gender,
      ageGroup,
      competitionTypes: competitionType
    });

    if (judges.length < 3) {
      return res.status(400).json({ 
        message: 'At least 3 judges must be assigned to this competition type before starting' 
      });
    }

    competition.startedAgeGroups.push({
      gender,
      ageGroup,
      competitionType,
      startedAt: new Date()
    });

    await competition.save();

    res.json({ message: 'Competition type started successfully' });
  } catch (error) {
    console.error('Start age group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Transactions
 */
const getTransactions = async (req, res) => {
  try {
    const competitionId = req.competitionId;

    const transactions = await Transaction.find({ competition: competitionId })
      .populate('coach', 'name email')
      .populate('team', 'name')
      .sort({ createdAt: -1 });

    res.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Save Individual Score (Public route for judges)
 */
const saveIndividualScore = async (req, res) => {
  try {
    const { playerId, playerName, judgeType, score, teamId, gender, ageGroup, competitionType, breakdown } = req.body;

    // Validate required fields
    if (!playerId || !judgeType || score === undefined || !teamId || !gender || !ageGroup) {
      return res.status(400).json({
        message: 'Player ID, judge type, score, team ID, gender, and age group are required'
      });
    }

    // Validate score range
    const { validateScore } = require('../utils/scoreValidation');
    try {
      const validatedScore = validateScore(score);
      // Use validatedScore instead of raw score
      req.body.score = validatedScore;
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    console.log('🔍 Saving score:', { playerId, judgeType, score, teamId, gender, ageGroup, competitionType });

    // Convert competition type format from "competition_1" to "Competition I"
    const competitionTypeMap = {
      'competition_1': 'Competition I',
      'competition_2': 'Competition II',
      'competition_3': 'Competition III'
    };
    
    // Validate competition type
    if (competitionType && !competitionTypeMap[competitionType]) {
      console.warn(`Invalid competitionType received: ${competitionType}. Valid types: ${Object.keys(competitionTypeMap).join(', ')}`);
      return res.status(400).json({ 
        message: `Invalid competition type: ${competitionType}. Must be one of: ${Object.keys(competitionTypeMap).join(', ')}` 
      });
    }
    
    const formattedCompetitionType = competitionTypeMap[competitionType] || 'Competition I';

    // Get competition ID - either from request context (authenticated) or find active competition
    let competitionId = req.competitionId;
    
    if (!competitionId) {
      // Try to find the competition that has this registered team
      const competition = await Competition.findOne({
        'registeredTeams._id': teamId,
        isDeleted: false
      }).select('_id');
      
      if (!competition) {
        return res.status(404).json({ message: 'Competition not found for this team' });
      }
      
      competitionId = competition._id;
    }

    console.log('✅ Using competition:', competitionId);

    // Find or create score record for this team/gender/age group/competition
    let scoreRecord = await Score.findOne({ 
      teamId, 
      gender, 
      ageGroup,
      competition: competitionId,
      competitionType: formattedCompetitionType
    });

    if (!scoreRecord) {
      // Create new score record
      scoreRecord = new Score({
        teamId,
        gender,
        ageGroup,
        competition: competitionId,
        competitionType: formattedCompetitionType,
        playerScores: []
      });
    }

    // Validate playerId
    if (!playerId || playerId === '') {
      return res.status(400).json({ message: 'Player ID is required and cannot be empty' });
    }

    // Find or create player score entry with safe comparison
    let playerScore = scoreRecord.playerScores.find(ps => 
      ps.playerId && String(ps.playerId) === String(playerId)
    );

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
        scoreBreakdown: breakdown || {
          difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
          combination: {
            fullApparatusUtilization: true,
            rightLeftExecution: true,
            forwardBackwardFlexibility: true,
            minimumElementCount: true,
            total: 1.60
          },
          execution: 0,
          originality: 0
        },
        averageMarks: 0,
        deduction: 0,
        otherDeduction: 0,
        finalScore: 0
      };
      scoreRecord.playerScores.push(playerScore);
    } else {
      // Update breakdown if provided
      if (breakdown) {
        playerScore.scoreBreakdown = breakdown;
      }
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
      default:
        console.warn(`Invalid judgeType received: ${judgeType} with score ${score}`);
        return res.status(400).json({ 
          message: `Invalid judge type: ${judgeType}. Must be one of: Senior Judge, Judge 1, Judge 2, Judge 3, Judge 4` 
        });
    }

    // Recalculate using scoring logic
    const scoringUtils = require('../utils/scoringUtils');
    const calculationResult = scoringUtils.calculateScore(playerScore.judgeScores);
    
    // Update player score with calculation results
    playerScore.executionAverage = calculationResult.executionAverage;
    playerScore.baseScore = calculationResult.baseScore;
    playerScore.baseScoreApplied = calculationResult.baseScoreApplied;
    playerScore.toleranceUsed = calculationResult.toleranceUsed;
    playerScore.averageMarks = calculationResult.averageMarks;
    
    // Calculate final score with deductions
    playerScore.finalScore = scoringUtils.calculateFinalScore(
      playerScore.averageMarks,
      playerScore.deduction,
      playerScore.otherDeduction
    );

    await scoreRecord.save();

    console.log('✅ Score saved successfully:', { playerId, judgeType, score });

    // Emit real-time update via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      const roomId = `scoring_${gender}_${ageGroup}_${competitionType || 'competition_1'}`;
      io.to(roomId).emit('score_updated', {
        playerId,
        playerName: playerName || 'Unknown Player',
        judgeType,
        score: parseFloat(score),
        breakdown,
        roomId,
        competitionId: competitionId,
        teamId,
        gender,
        ageGroup,
        competitionType: formattedCompetitionType
      });
      console.log('📡 Score update broadcasted to room:', roomId);
    }

    res.json({
      message: 'Score saved successfully',
      playerId,
      judgeType,
      score: parseFloat(score),
      averageMarks: playerScore.averageMarks,
      finalScore: playerScore.finalScore,
      breakdown: playerScore.scoreBreakdown
    });

  } catch (error) {
    console.error('Save individual score error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Public Scores (no authentication required)
 */
const getPublicScores = async (req, res) => {
  try {
    const { teamId, gender, ageGroup, competitionId, page, limit } = req.query;
    const { paginate, getPaginationMeta } = require('../utils/pagination');

    // Require competition context to avoid exposing scores across all competitions
    let competition = competitionId;
    
    if (!competition) {
      // Try to find active competition
      const Competition = require('../models/Competition');
      const activeCompetition = await Competition.findOne({ 
        status: { $in: ['upcoming', 'ongoing'] },
        isDeleted: false 
      }).sort({ startDate: -1 });
      
      if (activeCompetition) {
        competition = activeCompetition._id;
      } else {
        return res.status(400).json({ 
          message: 'Competition ID is required or no active competition found' 
        });
      }
    }

    const query = { competition };
    if (teamId) query.teamId = teamId;
    if (gender) query.gender = gender;
    if (ageGroup) query.ageGroup = ageGroup;

    // Get total count for pagination
    const total = await Score.countDocuments(query);

    // Apply pagination
    const scoresQuery = Score.find(query)
      .populate('teamId', 'name')
      .sort({ updatedAt: -1 });
    
    const scores = await paginate(scoresQuery, page, limit);
    const pagination = getPaginationMeta(total, page, limit);

    res.json({ scores, pagination });
  } catch (error) {
    console.error('Get public scores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Public Teams (no authentication required)
 */
const getPublicTeams = async (req, res) => {
  try {
    // Scope by active competition like getSubmittedTeams does
    const activeCompetition = await Competition.findOne({ 
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false 
    })
      .populate('registeredTeams.coach', 'name email')
      .populate('registeredTeams.team', 'name')
      .sort({ startDate: -1 });
    
    if (!activeCompetition) {
      return res.status(404).json({ 
        message: 'No active competition found' 
      });
    }

    const teams = activeCompetition.registeredTeams
      .filter(rt => rt.isSubmitted)
      .map(rt => ({
        _id: rt._id,
        name: rt.team?.name || 'Unnamed Team',
        coach: rt.coach,
        isSubmitted: rt.isSubmitted,
        submittedAt: rt.submittedAt
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ teams });
  } catch (error) {
    console.error('Get public teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Public Competitions (for judge scoring page)
 */
const getPublicCompetitions = async (req, res) => {
  try {
    const competitions = await Competition.find({
      status: { $in: ['upcoming', 'ongoing'] },
      isDeleted: false
    })
      .select('name place year startDate endDate status competitionTypes')
      .sort({ startDate: -1 });

    res.json({ competitions });
  } catch (error) {
    console.error('Get public competitions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getDashboardStats,
  getAllTeams,
  getTeamDetails,
  getSubmittedTeams,
  addScore,
  saveScores,
  unlockScores,
  getTeamScores,
  getIndividualScores,
  getTeamRankings,
  getAllPlayers,
  saveJudges,
  getJudges,
  createSingleJudge,
  updateJudge,
  deleteJudge,
  getAllJudgesSummary,
  startAgeGroup,
  getTransactions,
  saveIndividualScore,
  getPublicScores,
  getPublicTeams,
  getPublicCompetitions
};
