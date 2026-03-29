import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Send, User, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { judgeAPI } from '../services/api';
import { logger } from '../utils/logger';

const JudgeScoring = () => {
  const [searchParams] = useSearchParams();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get URL parameters
  const urlGender = searchParams.get('gender');
  const urlAgeGroup = searchParams.get('ageGroup');
  const urlCompetitionType = searchParams.get('competitionType');

  // Selection states
  const [selectedCompetition, setSelectedCompetition] = useState('');
  const [selectedGender, setSelectedGender] = useState(urlGender || '');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(urlAgeGroup || '');
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(urlCompetitionType || '');
  const [selectedJudge, setSelectedJudge] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('');

  // Data states
  const [competitions, setCompetitions] = useState([]);
  const [judges, setJudges] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  // Scoring state
  const [score, setScore] = useState('');

  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
  ];

  const boysAgeGroups = [
    { value: 'Under10', label: 'Under 10' },
    { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' },
    { value: 'Under18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const girlsAgeGroups = [
    { value: 'Under10', label: 'Under 10' },
    { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' },
    { value: 'Under16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I' },
    { value: 'competition_2', label: 'Competition II' },
    { value: 'competition_3', label: 'Competition III' }
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  // Check if filters are pre-selected from URL
  const hasPreselectedFilters = urlGender && urlAgeGroup && urlCompetitionType;

  // Initialize Socket.IO connection
  useEffect(() => {
    // Fetch available competitions on mount (only if filters are not pre-selected)
    if (!hasPreselectedFilters) {
      fetchCompetitions();
    }

    // Remove /api from the URL for Socket.IO connection
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      logger.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      logger.log('Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      logger.error('Connection error:', error);
      toast.error('Failed to connect to server');
    });

    // Listen for score updates from other judges
    newSocket.on('score_updated', (data) => {
      toast(`${data.judgeType} scored ${data.score} for ${data.playerName}`, {
        icon: '📊',
        duration: 2000
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, [hasPreselectedFilters]);

  // Join scoring room when all selections are made
  useEffect(() => {
    // Use preselected values as fallback when hasPreselectedFilters is true
    const competition = hasPreselectedFilters ? (selectedCompetition || 'preselected') : selectedCompetition;
    const gender = hasPreselectedFilters ? (selectedGender || urlGender) : selectedGender;
    const ageGroup = hasPreselectedFilters ? (selectedAgeGroup || urlAgeGroup) : selectedAgeGroup;
    const competitionType = hasPreselectedFilters ? (selectedCompetitionType || urlCompetitionType) : selectedCompetitionType;

    if (socket && socket.connected && competition && gender && ageGroup && competitionType) {
      const roomId = `scoring_${competition}_${gender}_${ageGroup}_${competitionType}`;
      socket.emit('join_scoring_room', roomId);
      logger.log('Joined room:', roomId);
    }
  }, [socket, selectedCompetition, selectedGender, selectedAgeGroup, selectedCompetitionType, hasPreselectedFilters, urlGender, urlAgeGroup, urlCompetitionType]);

  // Fetch judges when all required selections are made (or when filters are pre-selected)
  useEffect(() => {
    if (hasPreselectedFilters || (selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType)) {
      fetchJudges().catch(error => {
        logger.error('Error in fetchJudges useEffect:', error);
      });
    }
  }, [selectedCompetition, selectedGender, selectedAgeGroup, selectedCompetitionType, hasPreselectedFilters]);

  // Fetch teams when all required selections are made (or when filters are pre-selected)
  useEffect(() => {
    if (hasPreselectedFilters || (selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType)) {
      fetchTeams().catch(error => {
        logger.error('Error in fetchTeams useEffect:', error);
      });
    }
  }, [selectedCompetition, selectedGender, selectedAgeGroup, selectedCompetitionType, hasPreselectedFilters]);

  // Fetch players when team is selected
  useEffect(() => {
    if (selectedTeam) {
      fetchPlayers();
    }
  }, [selectedTeam]);

  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const response = await judgeAPI.getCompetitions();
      setCompetitions(response.data.competitions || []);
    } catch (error) {
      logger.error('Error fetching competitions:', error);
      toast.error('Failed to load competitions');
      setCompetitions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchJudges = async () => {
    try {
      setLoading(true);
      const params = {
        gender: selectedGender,
        ageGroup: selectedAgeGroup,
        competitionType: selectedCompetitionType
      };
      
      // Only add competition if it's selected (not needed for public API)
      if (selectedCompetition) {
        params.competition = selectedCompetition;
      }
      
      const response = await judgeAPI.getJudges(params);

      // Filter out empty judges and filter by competition type
      const activeJudges = response.data.judges.filter(judge => 
        judge.name && judge.name.trim() !== '' &&
        judge.competitionTypes && judge.competitionTypes.includes(selectedCompetitionType)
      );
      setJudges(activeJudges);

      // Reset judge selection
      setSelectedJudge('');
    } catch (error) {
      logger.error('Error fetching judges:', error);
      setJudges([]);
      // Reset judge selection
      setSelectedJudge('');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const params = {
        gender: selectedGender,
        ageGroup: selectedAgeGroup,
        competitionType: selectedCompetitionType
      };
      
      // Only add competition if it's selected (not needed for public API)
      if (selectedCompetition) {
        params.competition = selectedCompetition;
      }
      
      const response = await judgeAPI.getSubmittedTeams(params);

      setTeams(response.data.teams || []);

      // Reset team and player selection
      setSelectedTeam('');
      setSelectedPlayer('');
      setPlayers([]);
    } catch (error) {
      logger.error('Error fetching teams:', error);
      setTeams([]);
      // Reset team and player selection
      setSelectedTeam('');
      setSelectedPlayer('');
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = () => {
    try {
      const team = teams.find(t => t._id === selectedTeam);
      if (team && team.players) {
        // Filter players by selected gender and age group
        const filteredPlayers = team.players
          .filter(playerEntry => 
            playerEntry.player.gender === selectedGender && 
            playerEntry.ageGroup === selectedAgeGroup
          )
          .map(playerEntry => ({
            id: playerEntry.player._id,
            name: `${playerEntry.player.firstName} ${playerEntry.player.lastName}`,
            gender: playerEntry.player.gender,
            ageGroup: playerEntry.ageGroup
          }));

        setPlayers(filteredPlayers);

        // Reset player selection
        setSelectedPlayer('');
      }
    } catch (error) {
      logger.error('Error processing players:', error);
      toast.error('Failed to load players');
      setPlayers([]);
    }
  };

  const submitScore = async () => {
    if (!selectedGender || !selectedAgeGroup || !selectedJudge || !selectedPlayer || !score) {
      toast.error('Please complete all selections and enter a score');
      return;
    }

    const scoreValue = parseFloat(score);
    if (isNaN(scoreValue) || scoreValue < 0 || scoreValue > 10) {
      toast.error('Score must be between 0 and 10');
      return;
    }

    // Get selected judge and player info
    const judge = judges.find(j => j._id === selectedJudge);
    const player = players.find(p => p.id === selectedPlayer);

    if (!judge || !player) {
      toast.error('Invalid judge or player selection');
      return;
    }

    // Save to database first
    const team = teams.find(t => t._id === selectedTeam);
    if (!team) {
      toast.error('Invalid team selection');
      return;
    }

    try {
      // Await the database save
      await judgeAPI.saveScore({
        playerId: player.id,
        playerName: player.name,
        judgeType: judge.judgeType,
        score: scoreValue,
        teamId: team._id,
        gender: selectedGender,
        ageGroup: selectedAgeGroup
      });

      // Emit score update after successful save
      if (socket && socket.connected) {
        // Use preselected values as fallback when hasPreselectedFilters is true
        const competition = hasPreselectedFilters ? (selectedCompetition || 'preselected') : selectedCompetition;
        const gender = hasPreselectedFilters ? (selectedGender || urlGender) : selectedGender;
        const ageGroup = hasPreselectedFilters ? (selectedAgeGroup || urlAgeGroup) : selectedAgeGroup;
        const competitionType = hasPreselectedFilters ? (selectedCompetitionType || urlCompetitionType) : selectedCompetitionType;

        const updateData = {
          playerId: player.id,
          playerName: player.name,
          judgeType: judge.judgeType,
          score: scoreValue,
          roomId: `scoring_${competition}_${gender}_${ageGroup}_${competitionType}`
        };

        logger.log('Sending score update:', updateData);
        socket.emit('score_update', updateData);
      }

      toast.success(`${judge.judgeType} scored ${scoreValue} for ${player.name}`, {
        duration: 2000,
        icon: '✅'
      });

      setScore('');
    } catch (error) {
      logger.error('Failed to save score to database:', error);
      toast.error('Failed to save score. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Trophy className="h-6 w-6 text-purple-600" />
              <span className="font-bold text-lg text-gray-900">Judge Scoring</span>
            </div>
            <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Pre-selected Filters Summary */}
        {hasPreselectedFilters && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
              <Trophy className="h-5 w-5 mr-2" />
              Selected Category
            </h3>
            <div className="space-y-2 bg-white rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Gender:</span>
                <span className="text-sm font-bold text-gray-900">{selectedGender}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Age Group:</span>
                <span className="text-sm font-bold text-gray-900">
                  {getAvailableAgeGroups().find(ag => ag.value === selectedAgeGroup)?.label || selectedAgeGroup}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Competition:</span>
                <span className="text-sm font-bold text-gray-900">
                  {competitionTypes.find(ct => ct.value === selectedCompetitionType)?.label || selectedCompetitionType}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Competition Selection - Hidden if filters are pre-selected */}
        {!hasPreselectedFilters && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">1</span>
              Select Competition
            </h3>
          {loading && competitions.length === 0 ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading competitions...</p>
            </div>
          ) : competitions.length > 0 ? (
            <div className="space-y-2">
              {competitions.map((competition) => (
                <button
                  key={competition._id}
                  onClick={() => {
                    setSelectedCompetition(competition._id);
                    setSelectedGender('');
                    setSelectedAgeGroup('');
                    setSelectedCompetitionType('');
                    setSelectedJudge('');
                    setSelectedTeam('');
                    setSelectedPlayer('');
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                    selectedCompetition === competition._id
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900">{competition.name}</p>
                  <p className="text-sm text-gray-600">{competition.place} - {competition.year}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Trophy className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-gray-700 font-medium">No competitions available</p>
              <p className="text-sm text-gray-600 mt-1">Please contact the administrator</p>
            </div>
          )}
        </div>
        )}

        {/* Step 2: Gender Selection - Hidden if filters are pre-selected */}
        {!hasPreselectedFilters && selectedCompetition && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">2</span>
              Select Gender
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {genders.map((gender) => (
                <button
                  key={gender.value}
                  onClick={() => {
                    setSelectedGender(gender.value);
                    setSelectedAgeGroup('');
                    setSelectedCompetitionType('');
                    setSelectedJudge('');
                    setSelectedTeam('');
                    setSelectedPlayer('');
                  }}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    selectedGender === gender.value
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-900'
                  }`}
                >
                  {gender.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Age Group Selection - Hidden if filters are pre-selected */}
        {!hasPreselectedFilters && selectedCompetition && selectedGender && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">3</span>
              Select Age Group
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {getAvailableAgeGroups().map((ageGroup) => (
                <button
                  key={ageGroup.value}
                  onClick={() => {
                    setSelectedAgeGroup(ageGroup.value);
                    setSelectedCompetitionType('');
                    setSelectedJudge('');
                    setSelectedTeam('');
                    setSelectedPlayer('');
                  }}
                  className={`p-2 rounded-lg border-2 transition-colors text-sm ${
                    selectedAgeGroup === ageGroup.value
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-900'
                  }`}
                >
                  {ageGroup.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Competition Type Selection - Hidden if filters are pre-selected */}
        {!hasPreselectedFilters && selectedCompetition && selectedGender && selectedAgeGroup && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">4</span>
              Select Competition Type
            </h3>
            <div className="space-y-2">
              {competitionTypes.map((compType) => (
                <button
                  key={compType.value}
                  onClick={() => {
                    setSelectedCompetitionType(compType.value);
                    setSelectedJudge('');
                    setSelectedTeam('');
                    setSelectedPlayer('');
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
        )}

        {/* Step 5: Judge Selection */}
        {((hasPreselectedFilters) || (selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType)) && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">{hasPreselectedFilters ? '1' : '5'}</span>
              Select Judge
            </h3>
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading judges...</p>
              </div>
            ) : judges.length > 0 ? (
              <div className="space-y-2">
                {judges.map((judge) => (
                  <button
                    key={judge._id}
                    onClick={() => {
                      setSelectedJudge(judge._id);
                      setSelectedTeam('');
                      setSelectedPlayer('');
                    }}
                    className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                      selectedJudge === judge._id
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">{judge.name}</p>
                        <p className="text-sm text-gray-600">{judge.judgeType}</p>
                      </div>
                      <div className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        judge.judgeType === 'Senior Judge'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {judge.judgeType}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                <User className="h-10 w-10 text-yellow-600 mx-auto mb-3" />
                <p className="font-medium text-gray-900 mb-2">No Judges Assigned</p>
                <p className="text-sm text-gray-600 mb-3">
                  No judges have been assigned to this category yet.
                </p>
                <div className="text-xs text-gray-500 bg-white p-3 rounded border border-yellow-200 max-w-sm mx-auto">
                  <p className="font-medium mb-1">Selected:</p>
                  <p>Gender: {selectedGender}</p>
                  <p>Age Group: {selectedAgeGroup}</p>
                  <p>Competition: {competitionTypes.find(ct => ct.value === selectedCompetitionType)?.label}</p>
                  <p className="mt-2 text-yellow-700">Please contact the admin to assign judges for this category.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Team Selection */}
        {selectedJudge && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">{hasPreselectedFilters ? '2' : '6'}</span>
              Select Team
            </h3>
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading teams...</p>
              </div>
            ) : teams.length > 0 ? (
              <div className="space-y-2">
                {teams.map((team) => (
                  <button
                    key={team._id}
                    onClick={() => {
                      setSelectedTeam(team._id);
                      setSelectedPlayer('');
                    }}
                    className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                      selectedTeam === team._id
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{team.name}</p>
                      <p className="text-sm text-gray-600">Coach: {team.coach?.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <Trophy className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No teams found for this category</p>
              </div>
            )}
          </div>
        )}

        {/* Step 7: Player Selection */}
        {selectedTeam && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">{hasPreselectedFilters ? '3' : '7'}</span>
              Select Player
            </h3>
            {players.length > 0 ? (
              <div className="space-y-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player.id)}
                    className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                      selectedPlayer === player.id
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{player.name}</p>
                    <p className="text-sm text-gray-600">{player.gender} - {player.ageGroup}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No players found in this team for selected category</p>
              </div>
            )}
          </div>
        )}

        {/* Step 8: Score Input */}
        {selectedPlayer && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">{hasPreselectedFilters ? '4' : '8'}</span>
              Enter Score
            </h3>

            {/* Current Selection Summary */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600 mb-1">
                <strong>Judge:</strong> {judges.find(j => j._id === selectedJudge)?.judgeType}
              </p>
              <p className="text-sm text-gray-600 mb-1">
                <strong>Player:</strong> {players.find(p => p.id === selectedPlayer)?.name}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Category:</strong> {selectedGender} - {selectedAgeGroup}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Score (0-10)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-full px-4 py-3 text-2xl text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                  placeholder="0.0"
                />
              </div>

              {/* Quick Score Buttons */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Quick Scores:</p>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((quickScore) => (
                    <button
                      key={quickScore}
                      onClick={() => setScore(quickScore.toString())}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    >
                      {quickScore}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={submitScore}
                disabled={!score || !isConnected}
                className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 font-medium"
              >
                <Send className="h-5 w-5" />
                <span>Submit Score</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JudgeScoring;