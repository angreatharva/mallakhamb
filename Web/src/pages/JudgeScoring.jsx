import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Send, User, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { judgeAPI } from '../services/api';

const JudgeScoring = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Selection states
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('');
  const [selectedJudge, setSelectedJudge] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('');

  // Data states
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
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' }
  ];

  const girlsAgeGroups = [
    { value: 'U10', label: 'Under 10' },
    { value: 'U12', label: 'Under 12' },
    { value: 'U14', label: 'Under 14' },
    { value: 'U16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' }
  ];

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  // Initialize Socket.IO connection
  useEffect(() => {
    // Remove /api from the URL for Socket.IO connection
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
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
  }, []);

  // Join scoring room when gender and age group are selected
  useEffect(() => {
    if (socket && socket.connected && selectedGender && selectedAgeGroup) {
      const roomId = `scoring_${selectedGender}_${selectedAgeGroup}`;
      socket.emit('join_scoring_room', roomId);
      console.log('Joined room:', roomId);
    }
  }, [socket, selectedGender, selectedAgeGroup]);

  // Fetch judges when gender and age group are selected
  useEffect(() => {
    if (selectedGender && selectedAgeGroup) {
      fetchJudges().catch(error => {
        console.error('Error in fetchJudges useEffect:', error);
      });
    }
  }, [selectedGender, selectedAgeGroup]);

  // Fetch teams when gender and age group are selected
  useEffect(() => {
    if (selectedGender && selectedAgeGroup) {
      fetchTeams().catch(error => {
        console.error('Error in fetchTeams useEffect:', error);
      });
    }
  }, [selectedGender, selectedAgeGroup]);

  // Fetch players when team is selected
  useEffect(() => {
    if (selectedTeam) {
      fetchPlayers();
    }
  }, [selectedTeam]);

  const fetchJudges = async () => {
    try {
      setLoading(true);
      const response = await judgeAPI.getJudges({
        gender: selectedGender,
        ageGroup: selectedAgeGroup
      });

      // Filter out empty judges
      const activeJudges = response.data.judges.filter(judge => 
        judge.name && judge.name.trim() !== ''
      );
      setJudges(activeJudges);

      // Reset judge selection
      setSelectedJudge('');
    } catch (error) {
      console.error('Error fetching judges:', error);
      // Fallback: Create mock judges to prevent app crash
      const mockJudges = [
        {
          _id: 'mock-senior',
          name: 'Senior Judge',
          judgeType: 'Senior Judge',
          gender: selectedGender,
          ageGroup: selectedAgeGroup
        },
        {
          _id: 'mock-judge1',
          name: 'Judge 1',
          judgeType: 'Judge 1',
          gender: selectedGender,
          ageGroup: selectedAgeGroup
        },
        {
          _id: 'mock-judge2',
          name: 'Judge 2',
          judgeType: 'Judge 2',
          gender: selectedGender,
          ageGroup: selectedAgeGroup
        }
      ];
      setJudges(mockJudges);
      toast.error('Using mock judges - API connection failed');

      // Reset judge selection
      setSelectedJudge('');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await judgeAPI.getSubmittedTeams({
        gender: selectedGender,
        ageGroup: selectedAgeGroup
      });

      setTeams(response.data.teams || []);

      // Reset team and player selection
      setSelectedTeam('');
      setSelectedPlayer('');
      setPlayers([]);
    } catch (error) {
      console.error('Error fetching teams:', error);
      // Fallback: Create mock team to prevent app crash
      const mockTeam = {
        _id: 'mock-team-1',
        name: 'Test Team Warriors',
        coach: { name: 'Test Coach' },
        players: [
          {
            player: {
              _id: 'mock-player-1',
              firstName: 'Test',
              lastName: 'Player 1',
              gender: selectedGender
            },
            ageGroup: selectedAgeGroup
          },
          {
            player: {
              _id: 'mock-player-2',
              firstName: 'Test',
              lastName: 'Player 2',
              gender: selectedGender
            },
            ageGroup: selectedAgeGroup
          }
        ]
      };
      setTeams([mockTeam]);
      toast.error('Using mock team - API connection failed');

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
      console.error('Error processing players:', error);
      toast.error('Failed to load players');
      setPlayers([]);
    }
  };

  const submitScore = () => {
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

    // Emit score update
    if (socket && socket.connected) {
      const updateData = {
        playerId: player.id,
        playerName: player.name,
        judgeType: judge.judgeType,
        score: scoreValue,
        roomId: `scoring_${selectedGender}_${selectedAgeGroup}`
      };

      console.log('Sending score update:', updateData);

      // Send real-time update
      socket.emit('score_update', updateData);

      // Also save to database
      const team = teams.find(t => t._id === selectedTeam);
      if (team) {
        judgeAPI.saveScore({
          playerId: player.id,
          playerName: player.name,
          judgeType: judge.judgeType,
          score: scoreValue,
          teamId: team._id,
          gender: selectedGender,
          ageGroup: selectedAgeGroup
        }).then(() => {
          console.log('Score saved to database');
        }).catch(error => {
          console.error('Failed to save score to database:', error);
        });
      }

      toast.success(`${judge.judgeType} scored ${scoreValue} for ${player.name}`, {
        duration: 2000,
        icon: '✅'
      });

      setScore('');
    } else {
      toast.error('Not connected to server. Please refresh the page.');
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

        {/* Step 1: Gender Selection */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">1</span>
            Select Gender
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {genders.map((gender) => (
              <button
                key={gender.value}
                onClick={() => {
                  setSelectedGender(gender.value);
                  setSelectedAgeGroup('');
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

        {/* Step 2: Age Group Selection */}
        {selectedGender && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">2</span>
              Select Age Group
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {getAvailableAgeGroups().map((ageGroup) => (
                <button
                  key={ageGroup.value}
                  onClick={() => {
                    setSelectedAgeGroup(ageGroup.value);
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

        {/* Step 3: Judge Selection */}
        {selectedGender && selectedAgeGroup && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">3</span>
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
              <div className="text-center py-4">
                <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No judges found for this category</p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Team Selection */}
        {selectedJudge && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">4</span>
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

        {/* Step 5: Player Selection */}
        {selectedTeam && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">5</span>
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

        {/* Step 6: Score Input */}
        {selectedPlayer && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">6</span>
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