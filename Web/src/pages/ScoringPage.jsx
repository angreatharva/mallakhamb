import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, Users, Save, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { useRouteContext } from '../contexts/RouteContext';
import { ResponsiveScoringTable } from '../components/responsive/ResponsiveTable';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';

const ScoringPage = ({ routePrefix: routePrefixProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get route context from hook or use prop
  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  
  // Select the appropriate API service based on route context
  const apiService = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const { selectedTeam, selectedGender, selectedAgeGroup } = location.state || {};

  const [socket, setSocket] = useState(null);
  const [judges, setJudges] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [timeKeeper, setTimeKeeper] = useState('');
  const [scorer, setScorer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);

  // Initialize Socket.IO connection
  useEffect(() => {
    // Remove /api from the URL for Socket.IO connection
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      // Join scoring room for this age group and gender
      if (selectedGender?.value && selectedAgeGroup?.value) {
        const roomId = `scoring_${selectedGender.value}_${selectedAgeGroup.value}`;
        newSocket.emit('join_scoring_room', roomId);
        console.log('Joined room:', roomId);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Set up score update listener after players are loaded
  useEffect(() => {
    if (!socket) return;

    const handleScoreUpdate = (data) => {
      console.log('Received score update:', data);

      // Check if player exists in current players list
      const playerExists = players.some(p => p.id === data.playerId);
      console.log('Player exists in current list:', playerExists);
      console.log('Looking for player ID:', data.playerId);
      console.log('Available player IDs:', players.map(p => ({ id: p.id, name: p.name })));

      if (!playerExists) {
        console.warn('Player not found in current players list:', data.playerId);
        console.warn('Available players:', players);

        // Try to add the player dynamically if we can
        const newPlayer = {
          id: data.playerId,
          name: data.playerName,
          gender: selectedGender?.value,
          ageGroup: selectedAgeGroup?.value,
          teamName: 'Unknown Team'
        };

        setPlayers(prevPlayers => [...prevPlayers, newPlayer]);

        // Initialize score for new player
        setScores(prevScores => ({
          ...prevScores,
          [data.playerId]: {
            time: '',
            seniorJudge: '',
            judge1: '',
            judge2: '',
            judge3: '',
            judge4: '',
            deduction: '',
            otherDeduction: ''
          }
        }));

        toast.success(`Added ${data.playerName} to scoring session`);
      }

      // Map judge type to the correct field name
      let fieldName = '';
      switch (data.judgeType) {
        case 'Senior Judge':
          fieldName = 'seniorJudge';
          break;
        case 'Judge 1':
          fieldName = 'judge1';
          break;
        case 'Judge 2':
          fieldName = 'judge2';
          break;
        case 'Judge 3':
          fieldName = 'judge3';
          break;
        case 'Judge 4':
          fieldName = 'judge4';
          break;
        default:
          fieldName = 'seniorJudge';
      }

      console.log('Updating field:', fieldName, 'for player:', data.playerId, 'with score:', data.score);

      setScores(prevScores => {
        const newScores = {
          ...prevScores,
          [data.playerId]: {
            ...prevScores[data.playerId],
            [fieldName]: data.score.toString()
          }
        };
        console.log('New scores state:', newScores);
        return newScores;
      });

      toast.success(`${data.judgeType} scored ${data.score} for ${data.playerName}`, {
        duration: 2000,
        icon: '🎯'
      });
    };

    // Remove any existing listener and add new one
    socket.off('score_updated');
    socket.on('score_updated', handleScoreUpdate);

    return () => {
      socket.off('score_updated', handleScoreUpdate);
    };
  }, [socket, players, scores, selectedGender, selectedAgeGroup]);

  // Join room when socket connects and we have gender/age group
  useEffect(() => {
    if (socket && socket.connected && selectedGender?.value && selectedAgeGroup?.value) {
      const roomId = `scoring_${selectedGender.value}_${selectedAgeGroup.value}`;
      socket.emit('join_scoring_room', roomId);
      console.log('Joined scoring room:', roomId);
    }
  }, [socket, selectedGender, selectedAgeGroup]);

  // Fetch judges and players data
  useEffect(() => {
    if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
      navigate(routePrefix);
      return;
    }

    fetchJudgesAndPlayers();
  }, [selectedTeam, selectedGender, selectedAgeGroup]);

  const fetchJudgesAndPlayers = async () => {
    try {
      setLoading(true);

      // Fetch judges for the selected age group and gender
      const judgesResponse = await apiService.getJudges({
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value
      });

      // Filter out empty judges and sort by judgeNo
      const activeJudges = judgesResponse.data.judges
        .filter(judge => judge.name && judge.name.trim() !== '')
        .sort((a, b) => a.judgeNo - b.judgeNo);

      setJudges(activeJudges);

      // Get players from the selected team for this age group
      const teamPlayers = selectedTeam.players
        .filter(playerEntry =>
          playerEntry.player.gender === selectedGender.value &&
          playerEntry.ageGroup === selectedAgeGroup.value
        )
        .map(playerEntry => ({
          id: playerEntry.player._id,
          name: `${playerEntry.player.firstName} ${playerEntry.player.lastName}`,
          gender: playerEntry.player.gender,
          ageGroup: playerEntry.ageGroup,
          teamId: selectedTeam._id,
          teamName: selectedTeam.name
        }));

      // Also try to get all players for this category from all teams to support cross-team scoring
      try {
        const allTeamsResponse = await apiService.getSubmittedTeams({
          gender: selectedGender.value,
          ageGroup: selectedAgeGroup.value
        });

        const allPlayers = [];
        allTeamsResponse.data.teams.forEach(team => {
          team.players
            .filter(playerEntry =>
              playerEntry.player.gender === selectedGender.value &&
              playerEntry.ageGroup === selectedAgeGroup.value
            )
            .forEach(playerEntry => {
              allPlayers.push({
                id: playerEntry.player._id,
                name: `${playerEntry.player.firstName} ${playerEntry.player.lastName}`,
                gender: playerEntry.player.gender,
                ageGroup: playerEntry.ageGroup,
                teamId: team._id,
                teamName: team.name
              });
            });
        });

        console.log('All players in category:', allPlayers);
        setPlayers(allPlayers);

        // Initialize scores for all players
        const allPlayersScores = initializeScores(allPlayers);
        setScores(allPlayersScores);

        // Try to load existing scores from database for all teams
        loadExistingScores(null, selectedGender.value, selectedAgeGroup.value, allPlayersScores);
      } catch (error) {
        console.log('Could not load all players, using team players only:', error);
        setPlayers(teamPlayers);

        // Try to load existing scores from database for selected team
        loadExistingScores(selectedTeam._id, selectedGender.value, selectedAgeGroup.value, initialScores);
      }

      // Initialize scores object (this will be updated after we get all players)
      const initializeScores = (playersList) => {
        const initialScores = {};
        playersList.forEach(player => {
          initialScores[player.id] = {
            time: '',
            seniorJudge: '',
            judge1: '',
            judge2: '',
            judge3: '',
            judge4: '',
            deduction: '',
            otherDeduction: ''
          };
        });
        return initialScores;
      };

      // This will be overridden when we get all players, but set initial state
      const initialScores = initializeScores(teamPlayers);
      setScores(initialScores);

      console.log('Initialized players:', teamPlayers);
      console.log('Initialized scores:', initialScores);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load judges and players data');
    } finally {
      setLoading(false);
    }
  };

  const loadExistingScores = async (teamId, gender, ageGroup, initialScores) => {
    try {
      // Try to load existing scores from the database
      const response = await apiService.getTeamScores({
        teamId,
        gender,
        ageGroup
      });

      if (response.data && response.data.scores) {
        const existingScores = { ...initialScores };

        // Map database scores to the scores state
        response.data.scores.forEach(scoreRecord => {
          scoreRecord.playerScores.forEach(playerScore => {
            if (existingScores[playerScore.playerId]) {
              existingScores[playerScore.playerId] = {
                ...existingScores[playerScore.playerId],
                seniorJudge: playerScore.judgeScores.seniorJudge.toString(),
                judge1: playerScore.judgeScores.judge1.toString(),
                judge2: playerScore.judgeScores.judge2.toString(),
                judge3: playerScore.judgeScores.judge3.toString(),
                judge4: playerScore.judgeScores.judge4.toString(),
                deduction: playerScore.deduction.toString(),
                otherDeduction: playerScore.otherDeduction.toString()
              };
            }
          });
        });

        setScores(existingScores);
        console.log('Loaded existing scores:', existingScores);
      }
    } catch (error) {
      console.log('No existing scores found or error loading:', error);
      // This is fine, we'll start with empty scores
    }
  };

  const calculateAverageMarks = (playerScores) => {
    const judgeScores = [
      parseFloat(playerScores.seniorJudge) || 0,
      parseFloat(playerScores.judge1) || 0,
      parseFloat(playerScores.judge2) || 0,
      parseFloat(playerScores.judge3) || 0,
      parseFloat(playerScores.judge4) || 0
    ].filter(score => score > 0);

    if (judgeScores.length === 0) return 0;

    // If we have 3 or fewer scores, use all of them
    if (judgeScores.length <= 3) {
      return (judgeScores.reduce((sum, score) => sum + score, 0) / judgeScores.length).toFixed(2);
    }

    // If we have 4 or more scores, remove highest and lowest
    const sortedScores = [...judgeScores].sort((a, b) => a - b);

    // Remove the lowest (first) and highest (last) scores
    const trimmedScores = sortedScores.slice(1, -1);

    // Calculate average of remaining scores
    return (trimmedScores.reduce((sum, score) => sum + score, 0) / trimmedScores.length).toFixed(2);
  };

  const calculateFinalScore = (playerScores) => {
    const average = parseFloat(calculateAverageMarks(playerScores));
    const deduction = parseFloat(playerScores.deduction) || 0;
    const otherDeduction = parseFloat(playerScores.otherDeduction) || 0;
    return Math.max(0, average - deduction - otherDeduction).toFixed(2);
  };

  const getScoreBreakdown = (playerScores) => {
    const judgeScores = [
      { name: 'Senior', score: parseFloat(playerScores.seniorJudge) || 0 },
      { name: 'J1', score: parseFloat(playerScores.judge1) || 0 },
      { name: 'J2', score: parseFloat(playerScores.judge2) || 0 },
      { name: 'J3', score: parseFloat(playerScores.judge3) || 0 },
      { name: 'J4', score: parseFloat(playerScores.judge4) || 0 }
    ].filter(item => item.score > 0);

    if (judgeScores.length <= 3) {
      return { used: judgeScores, excluded: [] };
    }

    const sorted = [...judgeScores].sort((a, b) => a.score - b.score);
    const excluded = [sorted[0], sorted[sorted.length - 1]];
    const used = sorted.slice(1, -1);

    return { used, excluded };
  };

  const handleScoreChange = (playerId, field, value) => {
    console.log('Score change:', { playerId, field, value });

    setScores(prevScores => ({
      ...prevScores,
      [playerId]: {
        ...prevScores[playerId],
        [field]: value
      }
    }));

    // Emit real-time update via socket (only for judge scores, not time/deductions)
    if (socket && field !== 'time' && field !== 'deduction' && field !== 'otherDeduction') {
      const player = players.find(p => p.id === playerId);

      // Map field name back to judge type
      let judgeType = '';
      switch (field) {
        case 'seniorJudge':
          judgeType = 'Senior Judge';
          break;
        case 'judge1':
          judgeType = 'Judge 1';
          break;
        case 'judge2':
          judgeType = 'Judge 2';
          break;
        case 'judge3':
          judgeType = 'Judge 3';
          break;
        case 'judge4':
          judgeType = 'Judge 4';
          break;
      }

      if (judgeType) {
        socket.emit('score_update', {
          playerId,
          playerName: player?.name,
          judgeType,
          score: parseFloat(value) || 0,
          roomId: `scoring_${selectedGender?.value}_${selectedAgeGroup?.value}`
        });
      }
    }
  };

  const handleSaveScores = async () => {
    try {
      const scoringData = {
        teamId: selectedTeam._id,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        timeKeeper,
        scorer,
        remarks,
        playerScores: players.map(player => ({
          playerId: player.id,
          playerName: player.name,
          time: scores[player.id].time,
          judgeScores: {
            seniorJudge: parseFloat(scores[player.id].seniorJudge) || 0,
            judge1: parseFloat(scores[player.id].judge1) || 0,
            judge2: parseFloat(scores[player.id].judge2) || 0,
            judge3: parseFloat(scores[player.id].judge3) || 0,
            judge4: parseFloat(scores[player.id].judge4) || 0
          },
          averageMarks: parseFloat(calculateAverageMarks(scores[player.id])),
          deduction: parseFloat(scores[player.id].deduction) || 0,
          otherDeduction: parseFloat(scores[player.id].otherDeduction) || 0,
          finalScore: parseFloat(calculateFinalScore(scores[player.id]))
        }))
      };

      await apiService.saveScores(scoringData);

      // Show success message
      toast.success('🎉 Thank you for scoring! All scores have been saved successfully.', {
        duration: 3000,
        icon: '✅'
      });

      // Emit save event via socket
      if (socket) {
        socket.emit('scores_saved', {
          teamId: selectedTeam._id,
          roomId: `scoring_${selectedGender?.value}_${selectedAgeGroup?.value}`
        });
      }

      // Redirect to scores tab after a short delay
      setTimeout(() => {
        navigate(`${routePrefix}/dashboard/scores`);
      }, 2000);

    } catch (error) {
      console.error('Error saving scores:', error);
      toast.error('Failed to save scores');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading scoring page...</p>
        </div>
      </div>
    );
  }

  if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Invalid scoring session. Please go back and select a team.</p>
          <button
            onClick={() => navigate(routePrefix)}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(routePrefix)}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
              <div className="h-6 border-l border-gray-300"></div>
              <h1 className="text-xl font-bold text-gray-900">Live Scoring</h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live Updates Active</span>
              </div>

              <a
                href="/judge"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
              >
                Open Judge Panel
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Scoring Info */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Selected {selectedGender.label} - {selectedAgeGroup.label} for scoring
              </h2>
              <p className="text-gray-600">Team: {selectedTeam.name}</p>
              <p className="text-gray-600">Coach: {selectedTeam.coach?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Players in this category</p>
              <p className="text-2xl font-bold text-purple-600">{players.length}</p>
            </div>
          </div>

          {/* Judges Panel */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Judges Panel
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {judges.map((judge) => (
                <div key={judge._id} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mb-2 ${judge.judgeType === 'Senior Judge'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                    }`}>
                    {judge.judgeType}
                  </div>
                  <p className="font-medium text-gray-900">{judge.name}</p>
                  <p className="text-xs text-gray-500">{judge.username}</p>
                </div>
              ))}
            </div>
            {judges.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No judges found for this category. Please add judges first.
              </p>
            )}
          </div>
        </div>

        {/* Scoring Table */}
        {players.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Player Scoring
            </h3>

            {/* Scoring System Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-900 mb-2">Scoring System</h4>
              <p className="text-sm text-blue-800">
                <strong>Average Calculation:</strong> When 4+ judges score, the highest and lowest scores are excluded,
                and the average is calculated from the remaining scores. With 3 or fewer scores, all scores are used.
              </p>
              <p className="text-sm text-blue-800 mt-1">
                <strong>Final Score:</strong> Average Marks - Deduction - Other Deduction
              </p>
            </div>

            <ResponsiveScoringTable
              players={players}
              scores={scores}
              judges={judges}
              onScoreChange={handleScoreChange}
              isLocked={false}
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-gray-500">No players found for this category.</p>
          </div>
        )}

        {/* Footer Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Keeper
              </label>
              <input
                type="text"
                value={timeKeeper}
                onChange={(e) => setTimeKeeper(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter time keeper name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scorer
              </label>
              <input
                type="text"
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter scorer name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter any remarks"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveScores}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 font-medium"
            >
              <Save className="h-5 w-5" />
              <span>Save Scores</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoringPage;