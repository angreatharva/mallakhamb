const Judge = require('../models/Judge');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');
const bcrypt = require('bcryptjs');

/**
 * Judge Login
 * Authenticates judge and returns JWT with competition context
 * 
 * @route POST /api/judge/login
 * @access Public
 */
const loginJudge = async (req, res) => {
  console.log('🔍 Judge login attempt:', { username: req.body.username });
  
  try {
    const { username, password } = req.body;
    const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require('../utils/accountLockout');

    if (!username || !password) {
      console.log('❌ Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check if account is locked
    const lockStatus = checkAccountLockout(username);
    if (lockStatus.isLocked) {
      return res.status(429).json({ 
        message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockStatus.remainingTime} minutes.`,
        remainingTime: lockStatus.remainingTime
      });
    }

    // Find judge by username (case-insensitive)
    console.log('🔍 Looking for judge with username:', username);
    const judge = await Judge.findOne({ 
      username: username.toLowerCase(),
      isActive: true 
    }).populate('competition', 'name level place status');
    
    if (!judge) {
      console.log('❌ Judge not found for username:', username);
      recordFailedAttempt(username);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    console.log('🔍 Checking password for judge:', judge.username);
    const isMatch = await bcrypt.compare(password, judge.password);
    
    if (!isMatch) {
      console.log('❌ Password mismatch for judge:', judge.username);
      const failureStatus = recordFailedAttempt(username);
      if (failureStatus.isLocked) {
        return res.status(429).json({ 
          message: `Account locked due to multiple failed login attempts. Please try again in ${failureStatus.remainingTime} minutes.`,
          remainingTime: failureStatus.remainingTime
        });
      }
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(username);

    // Generate token WITH competition context
    console.log('✅ Generating token for judge:', judge.username);
    const token = generateToken(judge._id, 'judge', judge.competition._id);

    console.log('✅ Judge login successful:', judge.username);
    res.json({
      message: 'Login successful',
      token,
      judge: {
        id: judge._id,
        name: judge.name,
        username: judge.username,
        judgeType: judge.judgeType,
        gender: judge.gender,
        ageGroup: judge.ageGroup,
        competitionTypes: judge.competitionTypes,
        competition: {
          id: judge.competition._id,
          name: judge.competition.name,
          level: judge.competition.level,
          place: judge.competition.place,
          status: judge.competition.status
        }
      }
    });
  } catch (error) {
    console.error('❌ Judge login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * Get Assigned Competitions
 * Returns list of competitions the judge is assigned to
 * 
 * @route GET /api/judge/competitions/assigned
 * @access Protected (requires authentication)
 */
const getAssignedCompetitions = async (req, res) => {
  try {
    const judgeId = req.user._id;

    console.log('🔍 Fetching competitions for judge:', judgeId);

    // Find all judge records for this judge ID
    // A judge can have multiple records if assigned to multiple competitions
    const judgeRecords = await Judge.find({ _id: judgeId })
      .populate('competition', 'name level place status startDate endDate description')
      .select('competition');

    if (!judgeRecords || judgeRecords.length === 0) {
      console.log('❌ No judge records found');
      return res.status(404).json({ 
        message: 'No competition assignments found',
        competitions: []
      });
    }

    // Extract unique competitions
    const competitions = judgeRecords
      .filter(record => record.competition) // Filter out null competitions
      .map(record => ({
        _id: record.competition._id,
        name: record.competition.name,
        level: record.competition.level,
        place: record.competition.place,
        status: record.competition.status,
        startDate: record.competition.startDate,
        endDate: record.competition.endDate,
        description: record.competition.description
      }));

    // Remove duplicates based on competition ID
    const uniqueCompetitions = competitions.filter((comp, index, self) =>
      index === self.findIndex(c => c._id.toString() === comp._id.toString())
    );

    console.log(`✅ Found ${uniqueCompetitions.length} competition(s) for judge`);

    return res.status(200).json({
      competitions: uniqueCompetitions,
      count: uniqueCompetitions.length
    });
  } catch (error) {
    console.error('❌ Get assigned competitions error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching competitions'
    });
  }
};

/**
 * Set Competition Context
 * Validates judge access to competition and issues new JWT with competition context
 * 
 * @route POST /api/judge/set-competition
 * @access Protected (requires authentication)
 */
const setCompetition = async (req, res) => {
  try {
    const { competitionId } = req.body;
    const judgeId = req.user._id;

    // Validate competition ID is provided
    if (!competitionId) {
      return res.status(400).json({
        message: 'Competition ID is required'
      });
    }

    // Validate competition ID format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(competitionId)) {
      return res.status(400).json({
        error: 'Invalid Competition ID',
        message: 'Competition ID must be a valid ObjectId',
        value: competitionId
      });
    }

    // Verify competition exists
    const competition = await Competition.findById(competitionId);
    if (!competition) {
      return res.status(404).json({
        error: 'Competition Not Found',
        message: 'The specified competition does not exist',
        competitionId
      });
    }

    // Validate judge is assigned to this competition
    const judgeRecord = await Judge.findOne({
      _id: judgeId,
      competition: competitionId,
      isActive: true
    });

    if (!judgeRecord) {
      console.log('❌ Judge not assigned to competition:', { judgeId, competitionId });
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You are not assigned to this competition',
        competitionId
      });
    }

    // Generate new JWT token with competition context
    const token = generateToken(judgeId, 'judge', competitionId);

    console.log('✅ Competition context set for judge:', { judgeId, competitionId });

    return res.status(200).json({
      message: 'Competition context set successfully',
      token,
      competition: {
        id: competition._id,
        name: competition.name,
        level: competition.level,
        place: competition.place,
        status: competition.status,
        startDate: competition.startDate,
        endDate: competition.endDate
      },
      judge: {
        id: judgeRecord._id,
        name: judgeRecord.name,
        judgeType: judgeRecord.judgeType,
        gender: judgeRecord.gender,
        ageGroup: judgeRecord.ageGroup
      }
    });
  } catch (error) {
    console.error('❌ Set competition error:', error);
    return res.status(500).json({
      message: 'An error occurred while setting competition context'
    });
  }
};

/**
 * Get Available Teams for Scoring
 * Returns teams available for the judge's current competition
 * 
 * @route GET /api/judge/teams
 * @access Protected (requires authentication and competition context)
 */
const getAvailableTeams = async (req, res) => {
  try {
    const competitionId = req.competitionId;
    const judgeId = req.user._id;

    console.log('🔍 Fetching teams for judge scoring:', { judgeId, competitionId });

    // Get judge details to filter by gender and age group
    const judge = await Judge.findById(judgeId);
    if (!judge) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    // Import Team model
    const Team = require('../models/Team');

    // Find submitted teams for the current competition
    const teams = await Team.find({
      competition: competitionId,
      isSubmitted: true
    })
      .populate('coach', 'name email')
      .populate('players', 'firstName lastName gender ageGroup')
      .sort({ name: 1 });

    // Filter teams to only include players matching judge's gender and age group
    const filteredTeams = teams.map(team => {
      const matchingPlayers = team.players.filter(player => 
        player.gender === judge.gender && player.ageGroup === judge.ageGroup
      );

      return {
        _id: team._id,
        name: team.name,
        coach: team.coach,
        players: matchingPlayers,
        playerCount: matchingPlayers.length
      };
    }).filter(team => team.playerCount > 0); // Only include teams with matching players

    console.log(`✅ Found ${filteredTeams.length} team(s) with players for ${judge.gender} ${judge.ageGroup}`);

    return res.status(200).json({
      teams: filteredTeams,
      count: filteredTeams.length,
      judgeInfo: {
        gender: judge.gender,
        ageGroup: judge.ageGroup,
        judgeType: judge.judgeType
      }
    });
  } catch (error) {
    console.error('❌ Get available teams error:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching teams'
    });
  }
};

/**
 * Save Individual Score
 * Validates score belongs to judge's current competition and saves it
 * 
 * @route POST /api/judge/save-score
 * @access Protected (requires authentication and competition context)
 */
const saveIndividualScore = async (req, res) => {
  try {
    const { playerId, playerName, judgeType, score, teamId, gender, ageGroup } = req.body;
    const competitionId = req.competitionId;
    const judgeId = req.user._id;

    console.log('🔍 Judge saving score:', { judgeId, competitionId, playerId, judgeType, score });

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

    // Get judge details
    const judge = await Judge.findById(judgeId);
    if (!judge) {
      return res.status(404).json({ message: 'Judge not found' });
    }

    // Validate judge is scoring for their assigned gender and age group
    if (judge.gender !== gender || judge.ageGroup !== ageGroup) {
      console.log('❌ Judge attempting to score outside their assignment:', {
        judgeGender: judge.gender,
        judgeAgeGroup: judge.ageGroup,
        requestGender: gender,
        requestAgeGroup: ageGroup
      });
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You can only score for your assigned gender and age group',
        assigned: {
          gender: judge.gender,
          ageGroup: judge.ageGroup
        }
      });
    }

    // Validate judge type matches
    if (judge.judgeType !== judgeType) {
      console.log('❌ Judge type mismatch:', {
        judgeType: judge.judgeType,
        requestJudgeType: judgeType
      });
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Judge type mismatch',
        assigned: judge.judgeType
      });
    }

    // Import models
    const Team = require('../models/Team');
    const Score = require('../models/Score');

    // Validate team belongs to current competition
    const team = await Team.findOne({
      _id: teamId,
      competition: competitionId
    });

    if (!team) {
      console.log('❌ Team not found in current competition:', { teamId, competitionId });
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Team does not belong to your current competition',
        teamId,
        competitionId
      });
    }

    // Find or create score record for this team/gender/age group/competition
    let scoreRecord = await Score.findOne({ 
      teamId, 
      gender, 
      ageGroup,
      competition: competitionId 
    });

    if (!scoreRecord) {
      // Create new score record
      scoreRecord = new Score({
        teamId,
        gender,
        ageGroup,
        competition: competitionId,
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

    // Recalculate using new scoring logic with base score and tolerance
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
      const roomId = `scoring_${gender}_${ageGroup}`;
      io.to(roomId).emit('score_updated', {
        playerId,
        playerName: playerName || 'Unknown Player',
        judgeType,
        score: parseFloat(score),
        roomId,
        competitionId
      });
      console.log('📡 Score update broadcasted:', { playerId, judgeType, score });
    }

    res.json({
      message: 'Score saved successfully',
      playerId,
      judgeType,
      score: parseFloat(score),
      averageMarks: playerScore.averageMarks,
      finalScore: playerScore.finalScore
    });

  } catch (error) {
    console.error('❌ Save individual score error:', error);
    res.status(500).json({ message: 'Server error while saving score' });
  }
};

module.exports = {
  loginJudge,
  getAssignedCompetitions,
  setCompetition,
  getAvailableTeams,
  saveIndividualScore
};
