import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, Users, Save, ArrowLeft, Lock, Eye, Trophy, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../services/api';

const AdminScoring = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { selectedTeam, selectedGender, selectedAgeGroup } = location.state || {};

    const [socket, setSocket] = useState(null);
    const [judges, setJudges] = useState([]);
    const [players, setPlayers] = useState([]);
    const [scores, setScores] = useState({});
    const [timeKeeper, setTimeKeeper] = useState('');
    const [scorer, setScorer] = useState('');
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(true);
    const [isLocked, setIsLocked] = useState(false);
    const [existingScoreId, setExistingScoreId] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Initialize Socket.IO connection
    useEffect(() => {
        const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');
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

        newSocket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        return () => {
            newSocket.disconnect();
        };
    }, [selectedGender, selectedAgeGroup]);

    // Set up score update listener
    useEffect(() => {
        if (!socket) return;

        const handleScoreUpdate = (data) => {
            console.log('Received real-time score update:', data);

            // Don't update if scores are locked
            if (isLocked) {
                toast.info(`Score update received but entry is locked: ${data.judgeType} scored ${data.score} for ${data.playerName}`);
                return;
            }

            // Check if player exists in current players list
            const playerExists = players.some(p => p.id === data.playerId);

            if (!playerExists) {
                console.warn('Player not found in current players list:', data.playerId);
                return;
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

            setScores(prevScores => ({
                ...prevScores,
                [data.playerId]: {
                    ...prevScores[data.playerId],
                    [fieldName]: data.score.toString()
                }
            }));

            setLastUpdated(new Date());

            toast.success(`${data.judgeType} scored ${data.score} for ${data.playerName}`, {
                duration: 2000,
                icon: '🎯'
            });
        };

        socket.on('score_updated', handleScoreUpdate);

        return () => {
            socket.off('score_updated', handleScoreUpdate);
        };
    }, [socket, players, isLocked]);

    // Fetch data on component mount
    useEffect(() => {
        if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
            navigate('/admin/dashboard/scores');
            return;
        }

        fetchScoringData();
    }, [selectedTeam, selectedGender, selectedAgeGroup]);

    // Debug API calls - Remove in production
    useEffect(() => {
        const debugAPI = async () => {
            if (!selectedTeam || !selectedGender || !selectedAgeGroup) return;

            try {
                console.log('=== DEBUG API CALLS ===');
                console.log('Team:', selectedTeam.name, 'ID:', selectedTeam._id);
                console.log('Gender:', selectedGender.value);
                console.log('Age Group:', selectedAgeGroup.value);

                // Test all possible API calls
                const tests = [
                    { name: 'All Scores', params: {} },
                    { name: 'Team Only', params: { teamId: selectedTeam._id } },
                    { name: 'Team + Gender', params: { teamId: selectedTeam._id, gender: selectedGender.value } },
                    { name: 'Full Filter', params: { teamId: selectedTeam._id, gender: selectedGender.value, ageGroup: selectedAgeGroup.value } }
                ];

                for (const test of tests) {
                    try {
                        const response = await adminAPI.getTeamScores(test.params);
                        console.log(`${test.name}:`, response.data);

                        if (response.data?.scores?.length > 0) {
                            console.log(`${test.name} - Found ${response.data.scores.length} scores`);
                            response.data.scores.forEach((score, index) => {
                                console.log(`  Score ${index + 1}:`, {
                                    id: score._id,
                                    teamId: score.teamId,
                                    gender: score.gender,
                                    ageGroup: score.ageGroup,
                                    isLocked: score.isLocked,
                                    playerCount: score.playerScores?.length || 0
                                });
                            });
                        }
                    } catch (error) {
                        console.log(`${test.name} - Error:`, error.message);
                    }
                }
                console.log('=== END DEBUG ===');
            } catch (error) {
                console.error('Debug API calls failed:', error);
            }
        };

        // Run debug after a short delay to ensure other data is loaded
        const timer = setTimeout(debugAPI, 2000);
        return () => clearTimeout(timer);
    }, [selectedTeam, selectedGender, selectedAgeGroup]);

    const fetchScoringData = async () => {
        try {
            setLoading(true);
            console.log('Fetching scoring data for:', {
                team: selectedTeam.name,
                teamId: selectedTeam._id,
                gender: selectedGender.value,
                ageGroup: selectedAgeGroup.value
            });

            // Fetch judges for the selected age group and gender
            const judgesResponse = await adminAPI.getJudges({
                gender: selectedGender.value,
                ageGroup: selectedAgeGroup.value
            });

            const activeJudges = judgesResponse.data.judges
                .filter(judge => judge.name && judge.name.trim() !== '')
                .sort((a, b) => a.judgeNo - b.judgeNo);

            setJudges(activeJudges);
            console.log('Loaded judges:', activeJudges);

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

            setPlayers(teamPlayers);
            console.log('Loaded players:', teamPlayers);

            // Initialize scores object
            const initialScores = {};
            teamPlayers.forEach(player => {
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

            setScores(initialScores);
            console.log('Initialized scores:', initialScores);

            // Try to load existing scores from database
            await loadExistingScores(selectedTeam._id, selectedGender.value, selectedAgeGroup.value, initialScores, teamPlayers);

        } catch (error) {
            console.error('Error fetching scoring data:', error);
            toast.error('Failed to load scoring data');
        } finally {
            setLoading(false);
        }
    };

    const loadExistingScores = async (teamId, gender, ageGroup, initialScores, currentPlayers) => {
        try {
            console.log('🔍 LOADING EXISTING SCORES');
            console.log('Target:', { teamId, gender, ageGroup });
            console.log('Current players:', currentPlayers.map(p => ({ id: p.id, name: p.name })));

            // Fetch scores from API with specific filters
            let allResponse;
            try {
                allResponse = await adminAPI.getTeamScores({
                    teamId: teamId,
                    gender: gender,
                    ageGroup: ageGroup
                });
                console.log('📊 Raw API response:', allResponse.data);
            } catch (apiError) {
                console.error('❌ API call failed:', apiError);
                toast.error('API call failed - starting fresh session');
                setScores(initialScores);
                return;
            }

            // Validate response structure
            if (!allResponse || !allResponse.data) {
                console.error('❌ Invalid API response structure:', allResponse);
                toast.error('Invalid data format - starting fresh session');
                setScores(initialScores);
                return;
            }

            // Handle different response formats
            let matchingScores = [];
            if (allResponse.data.scores) {
                matchingScores = allResponse.data.scores;
            } else if (allResponse.data.teamScores) {
                matchingScores = allResponse.data.teamScores;
            }

            console.log(`📋 Matching scores found: ${matchingScores.length}`);

            // No scores found scenario
            if (matchingScores.length === 0) {
                console.log('ℹ️ No scores found for this team/category');
                toast.info('Starting fresh session');
                setScores(initialScores);
                return;
            }

            // Use the most recent score (first one)
            const existingScore = matchingScores[0];
            console.log('🎯 Using existing score:', existingScore);

            // Validate score data structure
            if (!existingScore.playerScores || !Array.isArray(existingScore.playerScores)) {
                console.error('❌ Invalid score data format - missing or invalid playerScores:', existingScore);
                toast.error('Invalid data format - starting fresh session');
                setScores(initialScores);
                return;
            }

            const existingScores = { ...initialScores };

            // Extract and set lock state from loaded scores
            const lockState = existingScore.isLocked || false;
            setIsLocked(lockState);
            setExistingScoreId(existingScore._id);

            console.log(`🔒 Lock state: ${lockState ? 'LOCKED' : 'UNLOCKED'}`);

            // Load team details
            if (existingScore.timeKeeper) setTimeKeeper(existingScore.timeKeeper);
            if (existingScore.scorer) setScorer(existingScore.scorer);
            if (existingScore.remarks) setRemarks(existingScore.remarks);

            // Track unmatched players for warnings
            const unmatchedPlayers = [];

            // Map database scores to UI state with improved player matching
            existingScore.playerScores.forEach(playerScore => {
                console.log('👤 Processing player:', playerScore.playerName, playerScore.playerId);

                let targetPlayerId = null;

                // Step 1: Try to match by playerId first (primary matching)
                if (playerScore.playerId && existingScores[playerScore.playerId]) {
                    targetPlayerId = playerScore.playerId;
                    console.log(`✅ Matched by playerId: ${playerScore.playerName} (${targetPlayerId})`);
                } else {
                    // Step 2: Fallback to matching by playerName
                    const matchingPlayer = currentPlayers.find(p => p.name === playerScore.playerName);
                    if (matchingPlayer) {
                        targetPlayerId = matchingPlayer.id;
                        console.log(`🔄 Matched by name: ${playerScore.playerName} (${playerScore.playerId} → ${targetPlayerId})`);
                    }
                }

                // If we found a match, load the scores
                if (targetPlayerId && existingScores[targetPlayerId]) {
                    existingScores[targetPlayerId] = {
                        time: playerScore.time || '',
                        seniorJudge: playerScore.judgeScores?.seniorJudge?.toString() || '',
                        judge1: playerScore.judgeScores?.judge1?.toString() || '',
                        judge2: playerScore.judgeScores?.judge2?.toString() || '',
                        judge3: playerScore.judgeScores?.judge3?.toString() || '',
                        judge4: playerScore.judgeScores?.judge4?.toString() || '',
                        deduction: playerScore.deduction?.toString() || '',
                        otherDeduction: playerScore.otherDeduction?.toString() || ''
                    };
                    console.log(`✅ Loaded scores for ${playerScore.playerName}:`, existingScores[targetPlayerId]);
                } else {
                    // Track unmatched players
                    unmatchedPlayers.push(playerScore.playerName);
                    console.warn(`⚠️ Could not match player ${playerScore.playerName} (${playerScore.playerId})`);
                }
            });

            // Log warnings for unmatched players
            if (unmatchedPlayers.length > 0) {
                console.warn('⚠️ Unmatched players:', unmatchedPlayers);
                console.warn('Available players:', currentPlayers.map(p => `${p.name} (${p.id})`));
                toast.warning(`Player matching failed for: ${unmatchedPlayers.join(', ')}`);
            }

            setScores(existingScores);
            setLastUpdated(new Date(existingScore.updatedAt || existingScore.createdAt));

            console.log('🎉 FINAL LOADED STATE:', existingScores);

            // Display appropriate user feedback based on lock state
            if (lockState) {
                toast.success('Found locked scoring session');
            } else {
                toast.success('Found existing scoring session');
            }

        } catch (error) {
            // Comprehensive error handling with detailed logging
            console.error('❌ Error loading existing scores:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            // Provide specific error feedback to user
            if (error.response) {
                // API returned an error response
                toast.error(`API call failed - starting fresh session`);
            } else if (error.request) {
                // Request was made but no response received
                toast.error('API call failed - starting fresh session');
            } else {
                // Something else went wrong
                toast.error('API call failed - starting fresh session');
            }

            // Reset to initial state
            setScores(initialScores);
            setIsLocked(false);
            setExistingScoreId(null);
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
        const trimmedScores = sortedScores.slice(1, -1);
        return (trimmedScores.reduce((sum, score) => sum + score, 0) / trimmedScores.length).toFixed(2);
    };

    const calculateFinalScore = (playerScores) => {
        const average = parseFloat(calculateAverageMarks(playerScores));
        const deduction = parseFloat(playerScores.deduction) || 0;
        const otherDeduction = parseFloat(playerScores.otherDeduction) || 0;
        return Math.max(0, average - deduction - otherDeduction).toFixed(2);
    };

    const handleScoreChange = (playerId, field, value) => {
        if (isLocked) {
            toast.error('Cannot edit scores - this entry is locked');
            return;
        }

        setScores(prevScores => ({
            ...prevScores,
            [playerId]: {
                ...prevScores[playerId],
                [field]: value
            }
        }));

        setLastUpdated(new Date());
    };

    const handleSaveScores = async () => {
        if (isLocked) {
            toast.error('Cannot save - this entry is already locked');
            return;
        }

        try {
            // Validate that we have at least some scores
            const hasAnyScores = players.some(player => {
                const playerScores = scores[player.id];
                return playerScores && (
                    playerScores.seniorJudge ||
                    playerScores.judge1 ||
                    playerScores.judge2 ||
                    playerScores.judge3 ||
                    playerScores.judge4
                );
            });

            if (!hasAnyScores) {
                toast.error('Please enter at least some scores before saving');
                return;
            }

            // Determine lock state based on score completeness
            const allPlayersScored = players.every(player => {
                const playerScore = scores[player.id];
                if (!playerScore) return false;

                // Check if player has at least one judge score and time
                const hasJudgeScores =
                    (playerScore.seniorJudge && parseFloat(playerScore.seniorJudge) > 0) ||
                    (playerScore.judge1 && parseFloat(playerScore.judge1) > 0) ||
                    (playerScore.judge2 && parseFloat(playerScore.judge2) > 0) ||
                    (playerScore.judge3 && parseFloat(playerScore.judge3) > 0) ||
                    (playerScore.judge4 && parseFloat(playerScore.judge4) > 0);
                const hasTime = playerScore.time && playerScore.time.trim() !== '';

                return hasJudgeScores && hasTime;
            });

            const shouldLock = allPlayersScored;

            const scoringData = {
                teamId: selectedTeam._id,
                teamName: selectedTeam.name,
                coachName: selectedTeam.coach?.name,
                coachEmail: selectedTeam.coach?.email,
                gender: selectedGender.value,
                ageGroup: selectedAgeGroup.value,
                timeKeeper,
                scorer,
                remarks,
                isLocked: shouldLock,
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
                })),
                judgeDetails: judges.map(judge => ({
                    judgeId: judge._id,
                    judgeName: judge.name,
                    judgeType: judge.judgeType,
                    username: judge.username
                }))
            };

            // Use saveScores for both create and update (backend handles both cases)
            const response = await adminAPI.saveScores(scoringData);

            // Update local lock state after successful save
            setIsLocked(shouldLock);
            setExistingScoreId(response.data.scoreId || response.data._id);

            // Show appropriate success message based on lock state
            if (shouldLock) {
                toast.success('🎉 Scores saved and locked successfully!', {
                    duration: 3000,
                    icon: '✅'
                });
            } else {
                toast.success('Scores saved as draft. You can continue editing.', {
                    duration: 3000,
                    icon: '💾'
                });
            }

            // Emit save event via socket
            if (socket) {
                socket.emit('scores_saved', {
                    teamId: selectedTeam._id,
                    roomId: `scoring_${selectedGender?.value}_${selectedAgeGroup?.value}`,
                    isLocked: shouldLock
                });
            }

        } catch (error) {
            console.error('Error saving scores:', error);
            toast.error('Failed to save scores');
        }
    };

    const handleUnlockScores = async () => {
        if (!existingScoreId) {
            toast.error('No existing score record found');
            return;
        }

        try {
            await adminAPI.unlockScores(existingScoreId);
            setIsLocked(false);
            toast.success('Scores unlocked for editing');
        } catch (error) {
            console.error('Error unlocking scores:', error);
            toast.error('Failed to unlock scores');
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
                        onClick={() => navigate('/admin/dashboard/scores')}
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        Back to Scores
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
                                onClick={() => navigate('/admin/dashboard/scores')}
                                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
                            >
                                <ArrowLeft className="h-5 w-5" />
                                <span>Back to Scores</span>
                            </button>
                            <div className="h-6 border-l border-gray-300"></div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                                <Trophy className="h-6 w-6 text-purple-600" />
                                <span>Admin Scoring</span>
                                {isLocked && <Lock className="h-5 w-5 text-red-500" />}
                            </h1>
                        </div>
                        <div className="flex items-center space-x-4 text-sm">
                            {isLocked ? (
                                <div className="flex items-center space-x-2 text-red-600">
                                    <Lock className="h-4 w-4" />
                                    <span>Locked Entry</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 text-green-600">
                                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                    <span>Live Updates Active</span>
                                </div>
                            )}

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
                {/* Status Banner */}
                {isLocked && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <AlertCircle className="h-5 w-5 text-red-600" />
                                <div>
                                    <p className="text-red-800 font-medium">This scoring session is locked</p>
                                    <p className="text-red-600 text-sm">Scores have been saved and cannot be modified. You can view the results below.</p>
                                </div>
                            </div>
                            <button
                                onClick={handleUnlockScores}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm flex items-center space-x-1"
                            >
                                <Lock className="h-4 w-4" />
                                <span>Unlock</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Scoring Info */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                {selectedGender.label} - {selectedAgeGroup.label} Scoring
                            </h2>
                            <p className="text-gray-600">Team: {selectedTeam.name}</p>
                            <p className="text-gray-600">Coach: {selectedTeam.coach?.name}</p>
                            {lastUpdated && (
                                <p className="text-gray-500 text-sm mt-2">
                                    Last updated: {lastUpdated.toLocaleString()}
                                </p>
                            )}
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
                            Player Scoring {isLocked && <Eye className="h-4 w-4 ml-2 text-gray-500" />}
                        </h3>

                        {/* Scoring System Info */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <h4 className="font-medium text-blue-900 mb-2">Scoring System</h4>
                            <p className="text-sm text-blue-800">
                                <strong>Average Calculation:</strong> When 4+ judges score, the highest and lowest scores are excluded.
                                With 3 or fewer scores, all scores are used.
                            </p>
                            <p className="text-sm text-blue-800 mt-1">
                                <strong>Final Score:</strong> Average Marks - Deduction - Other Deduction
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Participant Name
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Time
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Senior Judge
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Judge 1
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Judge 2
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Judge 3
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Judge 4
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Average Marks
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Deduction
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Other Deduction
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Final Score
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {players.map((player) => (
                                        <tr key={player.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">{player.name}</div>
                                                <div className="text-xs text-gray-500">{player.teamName}</div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <input
                                                    type="text"
                                                    value={scores[player.id]?.time || ''}
                                                    onChange={(e) => handleScoreChange(player.id, 'time', e.target.value)}
                                                    disabled={isLocked}
                                                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                                        }`}
                                                    placeholder="00:00"
                                                />
                                            </td>
                                            {['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'].map((judgeField) => (
                                                <td key={judgeField} className="px-4 py-4 whitespace-nowrap">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="10"
                                                        value={scores[player.id]?.[judgeField] || ''}
                                                        onChange={(e) => handleScoreChange(player.id, judgeField, e.target.value)}
                                                        disabled={isLocked}
                                                        className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                                            }`}
                                                        placeholder="0.0"
                                                    />
                                                </td>
                                            ))}
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="w-20 px-2 py-1 bg-blue-100 rounded text-center font-medium text-blue-800">
                                                    {calculateAverageMarks(scores[player.id] || {})}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    value={scores[player.id]?.deduction || ''}
                                                    onChange={(e) => handleScoreChange(player.id, 'deduction', e.target.value)}
                                                    disabled={isLocked}
                                                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                                        }`}
                                                    placeholder="0.0"
                                                />
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    value={scores[player.id]?.otherDeduction || ''}
                                                    onChange={(e) => handleScoreChange(player.id, 'otherDeduction', e.target.value)}
                                                    disabled={isLocked}
                                                    className={`w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                                        }`}
                                                    placeholder="0.0"
                                                />
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <div className="w-20 px-2 py-1 bg-green-100 rounded text-center font-bold text-green-800">
                                                    {calculateFinalScore(scores[player.id] || {})}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
                                disabled={isLocked}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
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
                                disabled={isLocked}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
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
                                disabled={isLocked}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                placeholder="Enter any remarks"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        {!isLocked ? (
                            <button
                                onClick={handleSaveScores}
                                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 font-medium"
                            >
                                <Save className="h-5 w-5" />
                                <span>Save & Lock Scores</span>
                            </button>
                        ) : (
                            <div className="flex items-center space-x-2 text-gray-500">
                                <Lock className="h-5 w-5" />
                                <span>Scores are saved and locked</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminScoring;