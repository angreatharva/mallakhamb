import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Scale, Users, User, Trophy, LogOut, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '../utils/apiConfig';
import { logger } from '../utils/logger';

const JudgeScoringNew = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Judge info from localStorage
  const [judgeInfo, setJudgeInfo] = useState(null);
  
  // Selection states
  const [selectedCompetitionType, setSelectedCompetitionType] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Data states
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  // Scoring states based on rules
  const [scores, setScores] = useState({
    difficulty: {
      aClass: 0,
      bClass: 0,
      cClass: 0,
      total: 0
    },
    combination: {
      fullApparatusUtilization: true,
      rightLeftExecution: true,
      forwardBackwardFlexibility: true,
      minimumElementCount: true,
      total: 1.60
    },
    execution: 0,
    originality: 0
  });

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I - Team' },
    { value: 'competition_2', label: 'Competition II - Individual' },
    { value: 'competition_3', label: 'Competition III - Apparatus' }
  ];

  // Load judge info on mount
  useEffect(() => {
    const storedJudge = localStorage.getItem('judge_user');
    if (!storedJudge) {
      toast.error('Please login first');
      navigate('/judge/login');
      return;
    }

    try {
      const judge = JSON.parse(storedJudge);
      setJudgeInfo(judge);

      // If judge has only one competition type, auto-select it
      if (judge.competitionTypes && judge.competitionTypes.length === 1) {
        setSelectedCompetitionType(judge.competitionTypes[0]);
      }
    } catch (error) {
      logger.error('Failed to parse judge data:', error);
      localStorage.removeItem('judge_user');
      toast.error('Invalid session data. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  // Track if we've joined the room to prevent duplicates
  const joinedRoomRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!judgeInfo) return;

    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      logger.log('Connected to server');
      
      // Join room if competition type is selected
      if (judgeInfo && selectedCompetitionType) {
        const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
        if (joinedRoomRef.current !== roomId) {
          newSocket.emit('join_scoring_room', roomId);
          joinedRoomRef.current = roomId;
          logger.log('Joined room:', roomId);
        }
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      joinedRoomRef.current = null;
      logger.log('Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      logger.error('Connection error:', error);
      toast.error('Failed to connect to server');
    });

    return () => {
      newSocket.disconnect();
      joinedRoomRef.current = null;
    };
  }, [judgeInfo, selectedCompetitionType]);

  // Join scoring room when competition type changes (if already connected)
  useEffect(() => {
    if (!socket || !socket.connected || !judgeInfo || !selectedCompetitionType) return;

    const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
    
    // Only join if we haven't already joined this room
    if (joinedRoomRef.current !== roomId) {
      socket.emit('join_scoring_room', roomId);
      joinedRoomRef.current = roomId;
      logger.log('Joined room:', roomId);
    }
  }, [socket, judgeInfo, selectedCompetitionType]);

  // Fetch teams when competition type is selected
  useEffect(() => {
    if (judgeInfo && selectedCompetitionType) {
      fetchTeams();
    }
  }, [judgeInfo, selectedCompetitionType]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('judge_token');
      
      const response = await axios.get(
        `${apiConfig.getBaseUrl()}/public/submitted-teams`,
        {
          params: {
            gender: judgeInfo.gender,
            ageGroup: judgeInfo.ageGroup,
            competitionType: selectedCompetitionType
          },
          headers: {
            ...apiConfig.getHeaders(),
            Authorization: `Bearer ${token}`
          }
        }
      );

      setTeams(response.data.teams || []);
      setSelectedTeam(null);
      setSelectedPlayer(null);
      setPlayers([]);
    } catch (error) {
      logger.error('Error fetching teams:', error);
      toast.error('Failed to load teams');
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = (team) => {
    setSelectedTeam(team);
    
    // Filter players by judge's gender and age group
    const filteredPlayers = team.players
      .filter(playerEntry => 
        playerEntry.player && 
        playerEntry.player.gender === judgeInfo.gender && 
        playerEntry.ageGroup === judgeInfo.ageGroup
      )
      .map(playerEntry => ({
        id: playerEntry.player._id,
        name: `${playerEntry.player.firstName} ${playerEntry.player.lastName}`,
        gender: playerEntry.player.gender,
        ageGroup: playerEntry.ageGroup
      }));

    setPlayers(filteredPlayers);
    setSelectedPlayer(null);
    resetScores();
  };

  const handlePlayerSelect = (player) => {
    setSelectedPlayer(player);
    resetScores();
  };

  const resetScores = () => {
    setScores({
      difficulty: {
        aClass: 0,
        bClass: 0,
        cClass: 0,
        total: 0
      },
      combination: {
        fullApparatusUtilization: true,
        rightLeftExecution: true,
        forwardBackwardFlexibility: true,
        minimumElementCount: true,
        total: 1.60
      },
      execution: 0,
      originality: 0
    });
  };

  // Calculate difficulty total
  const calculateDifficultyTotal = (aClass, bClass, cClass) => {
    return (aClass * 0.20) + (bClass * 0.40) + (cClass * 0.60);
  };

  // Handle difficulty changes
  const handleDifficultyChange = (classType, value) => {
    const numValue = parseInt(value) || 0;
    const newDifficulty = { ...scores.difficulty };
    
    if (classType === 'aClass') newDifficulty.aClass = numValue;
    if (classType === 'bClass') newDifficulty.bClass = numValue;
    if (classType === 'cClass') newDifficulty.cClass = numValue;
    
    newDifficulty.total = calculateDifficultyTotal(
      newDifficulty.aClass,
      newDifficulty.bClass,
      newDifficulty.cClass
    );
    
    setScores({ ...scores, difficulty: newDifficulty });
  };

  // Handle combination changes
  const handleCombinationChange = (field) => {
    const newCombination = {
      ...scores.combination,
      [field]: !scores.combination[field]
    };
    
    // Calculate deductions
    let deductions = 0;
    if (!newCombination.fullApparatusUtilization) deductions += 0.40;
    if (!newCombination.rightLeftExecution) deductions += 0.40;
    if (!newCombination.forwardBackwardFlexibility) deductions += 0.40;
    if (!newCombination.minimumElementCount) deductions += 0.40;
    
    newCombination.total = Math.max(0, 1.60 - deductions);
    
    setScores({ ...scores, combination: newCombination });
  };

  // Get required elements based on competition type
  const getRequiredElements = () => {
    if (selectedCompetitionType === 'competition_1') {
      return { a: 4, b: 6, c: 1 };
    } else {
      return { a: 1, b: 6, c: 2 };
    }
  };

  // Calculate final score
  const calculateFinalScore = () => {
    return (
      scores.difficulty.total +
      scores.combination.total +
      parseFloat(scores.execution || 0) +
      parseFloat(scores.originality || 0)
    ).toFixed(2);
  };

  const submitScore = async () => {
    if (!selectedPlayer) {
      toast.error('Please select a player');
      return;
    }

    const finalScore = calculateFinalScore();
    
    if (parseFloat(finalScore) === 0) {
      toast.error('Please enter scores');
      return;
    }

    try {
      const token = localStorage.getItem('judge_token');
      
      const scoreData = {
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.name,
        judgeType: judgeInfo.judgeType,
        score: parseFloat(finalScore),
        teamId: selectedTeam._id,
        gender: judgeInfo.gender,
        ageGroup: judgeInfo.ageGroup,
        competitionType: selectedCompetitionType,
        breakdown: {
          difficulty: scores.difficulty,
          combination: scores.combination,
          execution: parseFloat(scores.execution || 0),
          originality: parseFloat(scores.originality || 0)
        }
      };

      await axios.post(
        `${apiConfig.getBaseUrl()}/public/save-score`,
        scoreData,
        {
          headers: {
            ...apiConfig.getHeaders(),
            Authorization: `Bearer ${token}`
          }
        }
      );

      // Emit score update via websocket
      if (socket && socket.connected) {
        const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
        socket.emit('score_update', {
          ...scoreData,
          roomId
        });
      }

      toast.success(`Score ${finalScore} submitted for ${selectedPlayer.name}`);
      
      // Reset for next player
      setSelectedPlayer(null);
      resetScores();
      
    } catch (error) {
      logger.error('Failed to save score:', error);
      toast.error('Failed to save score. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('judge_token');
    localStorage.removeItem('judge_user');
    toast.success('Logged out successfully');
    navigate('/judge/login');
  };

  if (!judgeInfo) {
    return null;
  }

  const requiredElements = getRequiredElements();

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Scale className="h-6 w-6 text-purple-600" />
              <div>
                <h1 className="font-bold text-lg text-gray-900">Judge Scoring System</h1>
                <p className="text-sm text-gray-600">{judgeInfo.name} - {judgeInfo.judgeType}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium">{isConnected ? 'Live' : 'Offline'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Judge Assignment Info */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg shadow-md p-4 mb-4">
          <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
            <Trophy className="h-5 w-5 mr-2" />
            Your Assignment
          </h3>
          <div className="grid grid-cols-2 gap-3 bg-white rounded-lg p-3">
            <div>
              <span className="text-sm font-medium text-gray-600">Gender:</span>
              <p className="text-sm font-bold text-gray-900">{judgeInfo.gender}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">Age Group:</span>
              <p className="text-sm font-bold text-gray-900">{judgeInfo.ageGroup}</p>
            </div>
          </div>
        </div>

        {/* Step 1: Competition Type Selection */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">1</span>
            Select Competition Type
          </h3>
          <div className="space-y-2">
            {competitionTypes
              .filter(ct => !judgeInfo.competitionTypes || judgeInfo.competitionTypes.includes(ct.value))
              .map((compType) => (
                <button
                  key={compType.value}
                  onClick={() => {
                    setSelectedCompetitionType(compType.value);
                    setSelectedTeam(null);
                    setSelectedPlayer(null);
                    resetScores();
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                    selectedCompetitionType === compType.value
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-900'
                  }`}
                >
                  {compType.label}
                </button>
              ))}
          </div>
        </div>

        {/* Step 2: Team Selection */}
        {selectedCompetitionType && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">2</span>
              Select Team
            </h3>
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading teams...</p>
              </div>
            ) : teams.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {teams.map((team) => (
                  <button
                    key={team._id}
                    onClick={() => handleTeamSelect(team)}
                    className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                      selectedTeam?._id === team._id
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{team.name}</p>
                        <p className="text-sm text-gray-600">Coach: {team.coach?.name}</p>
                      </div>
                      {selectedTeam?._id === team._id && (
                        <CheckCircle className="h-5 w-5 text-purple-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <Users className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <p className="text-gray-700">No teams found for this category</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Player Selection */}
        {selectedTeam && players.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">3</span>
              Select Player
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerSelect(player)}
                  className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                    selectedPlayer?.id === player.id
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{player.name}</p>
                      <p className="text-sm text-gray-600">{player.gender} - {player.ageGroup}</p>
                    </div>
                    {selectedPlayer?.id === player.id && (
                      <CheckCircle className="h-5 w-5 text-purple-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Scoring Section */}
        {selectedPlayer && (
          <div className="space-y-4">
            {/* Current Selection */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Scoring For:</h3>
              <p className="text-lg font-bold text-gray-900">{selectedPlayer.name}</p>
              <p className="text-sm text-gray-600">{selectedTeam.name}</p>
            </div>

            {/* Difficulty Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                1. Difficulty (Max 3.80)
              </h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900 font-medium">Required Elements:</p>
                <p className="text-sm text-blue-800">
                  A Class: {requiredElements.a} × 0.20 | B Class: {requiredElements.b} × 0.40 | C Class: {requiredElements.c} × 0.60
                </p>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    A Class (×0.20)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={scores.difficulty.aClass}
                    onChange={(e) => handleDifficultyChange('aClass', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    B Class (×0.40)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={scores.difficulty.bClass}
                    onChange={(e) => handleDifficultyChange('bClass', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    C Class (×0.60)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={scores.difficulty.cClass}
                    onChange={(e) => handleDifficultyChange('cClass', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  />
                </div>
              </div>
              
              <div className={`text-right text-lg font-bold ${
                Math.abs(scores.difficulty.total - 3.80) < 0.01 ? 'text-green-600' : 'text-orange-600'
              }`}>
                Total: {scores.difficulty.total.toFixed(2)} / 3.80
              </div>
            </div>

            {/* Combination Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                2. Combination (Max 1.60)
              </h3>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={scores.combination.fullApparatusUtilization}
                    onChange={() => handleCombinationChange('fullApparatusUtilization')}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-gray-900">Full apparatus utilization</span>
                </label>
                
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={scores.combination.rightLeftExecution}
                    onChange={() => handleCombinationChange('rightLeftExecution')}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-gray-900">Right & left side execution</span>
                </label>
                
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={scores.combination.forwardBackwardFlexibility}
                    onChange={() => handleCombinationChange('forwardBackwardFlexibility')}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-gray-900">Forward & backward flexibility</span>
                </label>
                
                <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={scores.combination.minimumElementCount}
                    onChange={() => handleCombinationChange('minimumElementCount')}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-gray-900">Minimum element count met</span>
                </label>
              </div>
              
              <div className="text-right text-lg font-bold text-purple-600 mt-3">
                Total: {scores.combination.total.toFixed(2)} / 1.60
              </div>
            </div>

            {/* Execution Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                3. Execution (Max 4.40)
              </h3>
              <input
                type="number"
                step="0.1"
                min="0"
                max="4.40"
                value={scores.execution}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  const clamped = Math.max(0, Math.min(4.40, value));
                  setScores({ ...scores, execution: clamped });
                }}
                onBlur={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  const clamped = Math.max(0, Math.min(4.40, value));
                  setScores({ ...scores, execution: clamped });
                }}
                className="w-full px-4 py-3 text-2xl text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                placeholder="0.00"
              />
            </div>

            {/* Originality Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                4. Originality (Max 0.20)
              </h3>
              <input
                type="number"
                step="0.05"
                min="0"
                max="0.20"
                value={scores.originality}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  const clamped = Math.max(0, Math.min(0.20, value));
                  setScores({ ...scores, originality: clamped });
                }}
                onBlur={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  const clamped = Math.max(0, Math.min(0.20, value));
                  setScores({ ...scores, originality: clamped });
                }}
                className="w-full px-4 py-3 text-2xl text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                placeholder="0.00"
              />
            </div>

            {/* Final Score Display */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-lg p-6 text-white">
              <h3 className="text-lg font-semibold mb-2">Final Score</h3>
              <div className="text-5xl font-bold text-center">
                {calculateFinalScore()} / 10.00
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={submitScore}
              disabled={!isConnected}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 font-bold text-lg shadow-lg"
            >
              <CheckCircle className="h-6 w-6" />
              <span>Submit Score</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JudgeScoringNew;
