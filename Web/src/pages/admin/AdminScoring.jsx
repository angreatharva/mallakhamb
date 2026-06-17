// AdminScoring.jsx - Dark theme version
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { Clock, Save, ArrowLeft, Lock, Eye, Trophy, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { ResponsiveScoringTable } from '../../components/responsive/ResponsiveTable';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ADMIN_COLORS } from '../../styles/tokens';
import BHALogo from '../../assets/BHA.png';
import ConfirmDialog from '@/components/auth/ConfirmDialog';

const AdminScoring = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { routePrefix } = useRouteContext();
    const { currentCompetition } = useCompetition();
    const { selectedTeam, selectedGender, selectedAgeGroup, selectedCompetitionType } = location.state || {};
    const api = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;

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
    const [isConnected, setIsConnected] = useState(false);
    const [ageGroupStarted, setAgeGroupStarted] = useState(false);
    const [competitionType, setCompetitionType] = useState('Competition I');
    const [calculatedScores, setCalculatedScores] = useState([]);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [confirmDialogConfig, setConfirmDialogConfig] = useState({ title: '', message: '', shouldLock: false });

    useEffect(() => {
        const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
        const tokenKey = routePrefix === '/superadmin' ? 'admin_token' : 'admin_token';
        const token = secureStorage.getItem(tokenKey);
        
        // Connect with authentication token
        const newSocket = io(socketUrl, {
            auth: {
                token: token
            }
        });
        
        setSocket(newSocket);
        newSocket.on('connect', () => {
            setIsConnected(true);
            logger.info('Admin socket connected successfully');
            if (selectedGender?.value && selectedAgeGroup?.value && selectedCompetitionType?.value) {
                const roomId = `scoring_${selectedGender.value}_${selectedAgeGroup.value}_${selectedCompetitionType.value}`;
                newSocket.emit('join_scoring_room', { roomId });
                logger.info(`Joined scoring room: ${roomId}`);
            }
        });
        newSocket.on('disconnect', () => {
            setIsConnected(false);
            logger.info('Admin socket disconnected');
        });
        newSocket.on('connect_error', (error) => {
            setIsConnected(false);
            logger.error('Admin socket connection error:', error);
            // Handle authorization errors (Requirement 4.6)
            if (error.message && (error.message.includes('authorization') || error.message.includes('Unauthorized'))) {
                toast.error('Not authorized to access scoring room');
                navigate(`${routePrefix}/dashboard`);
            }
        });
        
        // Handle room join authorization errors (Requirement 4.2)
        newSocket.on('error', (error) => {
            logger.error('Socket error:', error);
            if (error.message === 'Not authorized to join this room') {
                toast.error('You do not have permission to access this scoring room');
                navigate(`${routePrefix}/dashboard/scores`);
            }
        });
        return () => newSocket.disconnect();
    }, [selectedGender, selectedAgeGroup, selectedCompetitionType, routePrefix]);

    useEffect(() => {
        if (!socket) return;
        const handleScoreUpdate = (data) => {
            if (isLocked) { toast(`Score update received but locked`, { icon: 'ℹ️' }); return; }
            const playerExists = players.some(p => p.id === data.playerId);
            if (!playerExists) return;
            const fieldMap = { 'Senior Judge': 'seniorJudge', 'Judge 1': 'judge1', 'Judge 2': 'judge2', 'Judge 3': 'judge3', 'Judge 4': 'judge4' };
            const fieldName = fieldMap[data.judgeType] || 'seniorJudge';
            setScores(prev => ({ ...prev, [data.playerId]: { ...prev[data.playerId], [fieldName]: data.score.toString() } }));
            setLastUpdated(new Date());
            toast.success(`${data.judgeType} scored ${data.score} for ${data.playerName}`, { duration: 2000, icon: '🎯' });
        };
        const handleScoresSaved = (data) => {
            if (data.teamId === selectedTeam?._id && data.gender === selectedGender?.value && data.ageGroup === selectedAgeGroup?.value) {
                toast('Scores updated by another user', { duration: 3000, icon: '🔄' });
                fetchScoringData();
            }
        };
        
        // Handle score update authorization errors (Requirement 4.3)
        const handleScoreUpdateError = (error) => {
            logger.error('Score update error:', error);
            if (error.message === 'Only judges can update scores') {
                toast.error('Only judges can submit scores');
            }
        };
        
        // Handle scores saved authorization errors (Requirement 4.4)
        const handleScoresSavedError = (error) => {
            logger.error('Scores saved error:', error);
            if (error.message === 'Unauthorized to save scores') {
                toast.error('You do not have permission to save scores');
            }
        };
        
        socket.on('score_updated', handleScoreUpdate);
        socket.on('scores_saved_notification', handleScoresSaved);
        socket.on('score_update_error', handleScoreUpdateError);
        socket.on('scores_saved_error', handleScoresSavedError);
        
        return () => { 
            socket.off('score_updated', handleScoreUpdate); 
            socket.off('scores_saved_notification', handleScoresSaved); 
            socket.off('score_update_error', handleScoreUpdateError);
            socket.off('scores_saved_error', handleScoresSavedError);
        };
    }, [socket, players, isLocked]);

    useEffect(() => {
        if (!selectedTeam || !selectedGender || !selectedAgeGroup) { navigate(`${routePrefix}/dashboard/scores`); return; }
        fetchScoringData();
    }, [selectedTeam, selectedGender, selectedAgeGroup, selectedCompetitionType]);

    const fetchScoringData = async () => {
        try {
            setLoading(true);
            const judgesParams = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value };
            if (selectedCompetitionType?.value) judgesParams.competitionTypes = selectedCompetitionType.value;
            // Add competition ID for superadmin
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                judgesParams.competition = currentCompetition._id;
            }
            
            const judgesResponse = await api.getJudges(judgesParams);
            const judgesData = judgesResponse.data.data || judgesResponse.data;
            const activeJudges = (Array.isArray(judgesData) ? judgesData : []).filter(j => !j.isEmpty && j.name?.trim()).sort((a, b) => a.judgeNo - b.judgeNo);
            setJudges(activeJudges);
            
            const summaryParams = {};
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                summaryParams.competition = currentCompetition._id;
            }
            const summaryResponse = await api.getAllJudgesSummary(summaryParams);
            const summaryData = summaryResponse.data.data?.summary || summaryResponse.data.summary || [];
            const ageGroupInfo = summaryData.find(item => item.gender === selectedGender.value && item.ageGroup === selectedAgeGroup.value);
            const compTypeStarted = selectedCompetitionType?.value ? ageGroupInfo?.competitionTypes?.[selectedCompetitionType.value]?.isStarted || false : ageGroupInfo?.isStarted || false;
            setAgeGroupStarted(compTypeStarted);
            
            // Extract just the competition type (e.g., "Competition I" from "Competition I - Team Championship")
            if (selectedCompetitionType?.label) {
                const competitionTypeMatch = selectedCompetitionType.label.match(/^(Competition [I]+)/);
                const extractedType = competitionTypeMatch ? competitionTypeMatch[1] : 'Competition I';
                setCompetitionType(extractedType);
            }
            
            const teamPlayers = selectedTeam.players
                .filter(pe => pe.player.gender === selectedGender.value && pe.ageGroup === selectedAgeGroup.value)
                .map(pe => ({ id: pe.player._id, name: `${pe.player.firstName} ${pe.player.lastName}`, gender: pe.player.gender, ageGroup: pe.ageGroup, teamId: selectedTeam._id, teamName: selectedTeam.name }));
            setPlayers(teamPlayers);
            const initialScores = {};
            teamPlayers.forEach(p => { initialScores[p.id] = { time: '', seniorJudge: '', judge1: '', judge2: '', judge3: '', judge4: '', deduction: '', otherDeduction: '' }; });
            setScores(initialScores);
            await loadExistingScores(selectedTeam._id, selectedGender.value, selectedAgeGroup.value, initialScores, teamPlayers);
        } catch (error) {
            logger.error('Error fetching scoring data:', error);
            toast.error('Failed to load scoring data');
        } finally {
            setLoading(false);
        }
    };

    const loadExistingScores = async (teamId, gender, ageGroup, initialScores, currentPlayers) => {
        try {
            logger.info('Loading existing scores for:', { teamId, gender, ageGroup, currentPlayers });
            
            const scoresParams = { teamId, gender, ageGroup };
            // Add competition ID for superadmin
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                scoresParams.competition = currentCompetition._id;
            }
            
            const allResponse = await api.getTeamScores(scoresParams);
            logger.info('Load existing scores response:', allResponse);
            logger.info('Response data:', allResponse?.data);
            logger.info('Response data type:', typeof allResponse?.data, Array.isArray(allResponse?.data));
            
            if (!allResponse?.data) { setScores(initialScores); return; }
            
            // The API might return { success: true, data: [...] } or just [...]
            // Handle both cases
            let teamsData = allResponse.data;
            if (allResponse.data.success && allResponse.data.data) {
                teamsData = allResponse.data.data;
            } else if (!Array.isArray(allResponse.data)) {
                teamsData = [allResponse.data];
            }
            
            logger.info('Teams data after parsing:', teamsData);
            
            const teamData = Array.isArray(teamsData) ? teamsData.find(t => t._id === teamId) || teamsData[0] : teamsData;
            
            logger.info('Team data found:', { 
                teamData, 
                hasScores: !!teamData?.scores, 
                scoresLength: teamData?.scores?.length,
                scoresIsArray: Array.isArray(teamData?.scores),
                scoresContent: teamData?.scores
            });
            
            if (!teamData || !teamData.scores || teamData.scores.length === 0) { 
                toast('Starting fresh session', { icon: 'ℹ️' }); 
                setScores(initialScores); 
                return; 
            }
            
            // Check if we have score metadata (isLocked, timeKeeper, etc.)
            const scoreMetadata = teamData.scoreMetadata;
            logger.info('Score metadata:', scoreMetadata);
            
            if (scoreMetadata) {
                logger.info('Setting isLocked to:', scoreMetadata.isLocked);
                setIsLocked(scoreMetadata.isLocked || false);
                setExistingScoreId(scoreMetadata._id);
                if (scoreMetadata.timeKeeper) setTimeKeeper(scoreMetadata.timeKeeper);
                if (scoreMetadata.scorer) setScorer(scoreMetadata.scorer);
                if (scoreMetadata.remarks) setRemarks(scoreMetadata.remarks);
                if (scoreMetadata.competitionType) setCompetitionType(scoreMetadata.competitionType);
                if (scoreMetadata.updatedAt) setLastUpdated(new Date(scoreMetadata.updatedAt));
                
                // Log the final isLocked state after setting
                logger.info('isLocked state after setting:', scoreMetadata.isLocked);
            } else {
                logger.warn('No score metadata found, setting isLocked to false');
                setIsLocked(false);
            }
            
            // Load calculated scores
            if (teamData.scores && Array.isArray(teamData.scores)) {
                setCalculatedScores(teamData.scores);
            }
            
            // Map player scores to input fields
            const existingScores = { ...initialScores };
            
            teamData.scores.forEach(ps => {
                // Try to match by playerId first, then by name
                let targetId = currentPlayers.find(p => p.id === ps.playerId || p.id === ps.playerId?.toString())?.id;
                if (!targetId) {
                    targetId = currentPlayers.find(p => p.name === ps.playerName)?.id;
                }
                
                logger.info('Mapping player score:', { 
                    playerName: ps.playerName, 
                    playerId: ps.playerId,
                    targetId, 
                    judgeScores: ps.judgeScores,
                    time: ps.time,
                    currentPlayers: currentPlayers.map(p => ({ id: p.id, name: p.name }))
                });
                
                if (targetId && existingScores[targetId]) {
                    existingScores[targetId] = { 
                        time: ps.time || '', 
                        seniorJudge: ps.judgeScores?.seniorJudge !== undefined && ps.judgeScores?.seniorJudge !== null ? ps.judgeScores.seniorJudge.toString() : '', 
                        judge1: ps.judgeScores?.judge1 !== undefined && ps.judgeScores?.judge1 !== null ? ps.judgeScores.judge1.toString() : '', 
                        judge2: ps.judgeScores?.judge2 !== undefined && ps.judgeScores?.judge2 !== null ? ps.judgeScores.judge2.toString() : '', 
                        judge3: ps.judgeScores?.judge3 !== undefined && ps.judgeScores?.judge3 !== null ? ps.judgeScores.judge3.toString() : '', 
                        judge4: ps.judgeScores?.judge4 !== undefined && ps.judgeScores?.judge4 !== null ? ps.judgeScores.judge4.toString() : '', 
                        deduction: ps.deduction !== undefined && ps.deduction !== null ? ps.deduction.toString() : '', 
                        otherDeduction: ps.otherDeduction !== undefined && ps.otherDeduction !== null ? ps.otherDeduction.toString() : '' 
                    };
                    logger.info('Successfully mapped score for player:', targetId, existingScores[targetId]);
                } else {
                    logger.warn('Could not find target player for score:', { playerId: ps.playerId, playerName: ps.playerName, targetId });
                }
            });
            
            logger.info('Final mapped scores:', existingScores);
            setScores(existingScores);
            toast.success(scoreMetadata?.isLocked ? 'Found locked scoring session' : 'Found existing scoring session');
        } catch (error) {
            logger.error('Error loading existing scores:', error);
            toast.error('API call failed - starting fresh session');
            setScores(initialScores);
            setIsLocked(false);
            setExistingScoreId(null);
            setCalculatedScores([]);
        }
    };

    const calculateAverageMarks = (playerScores) => {
        const executionScores = [parseFloat(playerScores.judge1) || 0, parseFloat(playerScores.judge2) || 0, parseFloat(playerScores.judge3) || 0, parseFloat(playerScores.judge4) || 0].filter(s => s > 0);
        if (executionScores.length === 0) return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0 };
        let executionAverage = 0;
        if (executionScores.length <= 2) executionAverage = executionScores.reduce((s, v) => s + v, 0) / executionScores.length;
        else if (executionScores.length === 3) executionAverage = [...executionScores].sort((a, b) => a - b)[1];
        else { const sorted = [...executionScores].sort((a, b) => a - b); const trimmed = sorted.slice(1, -1); executionAverage = trimmed.reduce((s, v) => s + v, 0) / trimmed.length; }
        const seniorJudge = parseFloat(playerScores.seniorJudge) || 0;
        if (seniorJudge === 0) return { average: parseFloat(executionAverage.toFixed(2)), baseScoreApplied: false, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: 0, tolerance: getTolerance(executionAverage) };
        const tolerance = getTolerance(executionAverage);
        if (Math.abs(executionAverage - seniorJudge) <= tolerance) return { average: parseFloat(executionAverage.toFixed(2)), baseScoreApplied: false, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: 0, tolerance };
        const baseScore = (executionAverage + seniorJudge) / 2;
        return { average: parseFloat(baseScore.toFixed(2)), baseScoreApplied: true, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: parseFloat(baseScore.toFixed(2)), tolerance };
    };

    const getTolerance = (score) => { if (score >= 9) return 0.10; if (score >= 8) return 0.20; if (score >= 7) return 0.30; if (score >= 6) return 0.40; if (score >= 5) return 0.50; return 1.00; };
    const calculateFinalScore = (ps) => { const r = calculateAverageMarks(ps); return Math.max(0, r.average - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2); };

    const handleScoreChange = (playerId, field, value) => {
        if (isLocked) { toast.error('Cannot edit scores - this entry is locked'); return; }
        setScores(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
        setLastUpdated(new Date());
    };

    const handleSaveScores = async () => {
        if (isLocked) { toast.error('Cannot save - this entry is already locked'); return; }
        
        // Validation: Check required fields (Time Keeper, Scorer)
        if (!timeKeeper?.trim()) {
            toast.error('Time Keeper name is required');
            return;
        }
        if (!scorer?.trim()) {
            toast.error('Scorer name is required');
            return;
        }
        
        const hasAnyScores = players.some(p => { const ps = scores[p.id]; return ps && (ps.seniorJudge || ps.judge1 || ps.judge2 || ps.judge3 || ps.judge4); });
        if (!hasAnyScores) { toast.error('Please enter at least some scores before saving'); return; }
        
        // Validation: Check that all players have Time entered
        const playersWithoutTime = players.filter(p => {
            const ps = scores[p.id];
            return !ps?.time?.trim();
        });
        
        if (playersWithoutTime.length > 0) {
            const playerNames = playersWithoutTime.map(p => p.name).join(', ');
            toast.error(`Time is required for all players. Missing for: ${playerNames}`);
            return;
        }
        
        const allPlayersScored = players.every(p => { const ps = scores[p.id]; if (!ps) return false; const hasJudge = (ps.seniorJudge && parseFloat(ps.seniorJudge) > 0) || (ps.judge1 && parseFloat(ps.judge1) > 0) || (ps.judge2 && parseFloat(ps.judge2) > 0) || (ps.judge3 && parseFloat(ps.judge3) > 0) || (ps.judge4 && parseFloat(ps.judge4) > 0); return hasJudge && ps.time?.trim(); });
        const shouldLock = allPlayersScored;
        
        // Show confirmation dialog before saving
        const dialogTitle = shouldLock ? 'Lock & Submit Scores' : 'Save Scores as Draft';
        const dialogMessage = shouldLock 
            ? '⚠️ WARNING: Once scores are submitted and locked, they CANNOT be changed.\n\nAre you sure you want to proceed?'
            : 'Save scores as draft? You can edit them later before locking.';
        
        setConfirmDialogConfig({ title: dialogTitle, message: dialogMessage, shouldLock });
        setShowConfirmDialog(true);
    };

    const handleConfirmSave = async () => {
        const shouldLock = confirmDialogConfig.shouldLock;
        
        try {
            const scoringData = {
                teamId: selectedTeam._id, teamName: selectedTeam.name, coachName: selectedTeam.coach?.name, coachEmail: selectedTeam.coach?.email,
                gender: selectedGender.value, ageGroup: selectedAgeGroup.value, competitionType, timeKeeper, scorer, remarks, isLocked: shouldLock,
                playerScores: players.map(p => { const r = calculateAverageMarks(scores[p.id]); return { playerId: p.id, playerName: p.name, time: scores[p.id].time, judgeScores: { seniorJudge: parseFloat(scores[p.id].seniorJudge) || 0, judge1: parseFloat(scores[p.id].judge1) || 0, judge2: parseFloat(scores[p.id].judge2) || 0, judge3: parseFloat(scores[p.id].judge3) || 0, judge4: parseFloat(scores[p.id].judge4) || 0 }, executionAverage: r.executionAvg, baseScore: r.baseScore, baseScoreApplied: r.baseScoreApplied, toleranceUsed: r.tolerance, averageMarks: r.average, deduction: parseFloat(scores[p.id].deduction) || 0, otherDeduction: parseFloat(scores[p.id].otherDeduction) || 0, finalScore: parseFloat(calculateFinalScore(scores[p.id])) }; }),
                judgeDetails: judges.map(j => ({ judgeId: j._id, judgeName: j.name, judgeType: j.judgeType, username: j.username }))
            };
            
            // Add competition ID for superadmin
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                scoringData.competition = currentCompetition._id;
            }
            
            const response = await api.saveScores(scoringData);
            
            // Extract calculated scores from backend response (Requirement 5.1, 5.2)
            // Backend returns { success: true, data: { scoreId, isLocked, playerScores } }
            const responseData = response.data.data || response.data;
            const { scoreId, isLocked: responseLocked, playerScores: calculatedPlayerScores } = responseData;
            
            // Update local state with calculated values
            setCalculatedScores(calculatedPlayerScores || []);
            setIsLocked(responseLocked);
            setExistingScoreId(scoreId);
            
            // Display success message with calculation info
            toast.success(
                responseLocked 
                    ? '🎉 Scores saved and locked! Calculations complete.' 
                    : 'Scores saved as draft with automatic calculations.',
                { duration: 3000 }
            );
            
            // Show calculation summary for players with base score applied
            if (calculatedPlayerScores && Array.isArray(calculatedPlayerScores)) {
                calculatedPlayerScores.forEach(ps => {
                    if (ps.baseScoreApplied) {
                        toast(
                            `${ps.playerName}: Base score applied (tolerance: ±${ps.toleranceUsed?.toFixed(2) || '0.00'})`,
                            { duration: 4000, icon: 'ℹ️' }
                        );
                    }
                });
            }
            
            if (socket && selectedGender?.value && selectedAgeGroup?.value && selectedCompetitionType?.value) {
                socket.emit('scores_saved', { teamId: selectedTeam._id, roomId: `scoring_${selectedGender.value}_${selectedAgeGroup.value}_${selectedCompetitionType.value}`, isLocked: responseLocked });
            }
        } catch (error) {
            logger.error('Error saving scores:', error);
            // Handle calculation errors gracefully (Requirement 5.7)
            const errorMessage = error.response?.data?.message || 'Failed to save scores';
            toast.error(errorMessage);
            throw error; // Re-throw to prevent dialog from closing on error
        }
    };

    const handleUnlockScores = async () => {
        if (ageGroupStarted) { toast.error('Cannot unlock. Age group has been started.'); return; }
        if (!existingScoreId) { toast.error('No existing score record found'); return; }
        try {
            await api.unlockScores(existingScoreId);
            setIsLocked(false);
            toast.success('Scores unlocked for editing');
            // Reload the scoring data to refresh the UI
            await fetchScoringData();
        } catch (error) {
            logger.error('Error unlocking scores:', error);
            toast.error('Failed to unlock scores');
        }
    };

    const darkInput = `w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] px-3 py-2.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`;
    const darkInputStyle = (disabled) => ({ background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}` });

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: ADMIN_COLORS.dark }}>
                <div className="text-center">
                    <div className="w-10 h-10 border-2 border-white/10 rounded-full mx-auto mb-4 animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
                    <p className="text-white/40 text-sm">Loading scoring page…</p>
                </div>
            </div>
        );
    }

    if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: ADMIN_COLORS.dark }}>
                <div className="text-center">
                    <p className="text-white/50 mb-4">Invalid scoring session. Please go back and select a team.</p>
                    <motion.button onClick={() => navigate(`${routePrefix}/dashboard/scores`)}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
                        style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})` }}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                        Back to Scores
                    </motion.button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh" style={{ background: ADMIN_COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
            <motion.header className="sticky top-0 z-40 border-b"
                style={{ background: 'rgba(10,10,10,0.94)', backdropFilter: 'blur(20px)', borderColor: ADMIN_COLORS.darkBorderSubtle }}
                initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
                <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
                    <div className="flex items-center gap-4">
                        <motion.button onClick={() => navigate(`${routePrefix}/dashboard/scores`)}
                            className="flex items-center gap-2 text-sm font-semibold min-h-[44px] px-3 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ color: 'rgba(255,255,255,0.6)' }} whileHover={{ color: '#fff' }}>
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Back to Scores</span>
                        </motion.button>
                        <div className="w-px h-5 bg-white/10" />
                        <div className="flex items-center gap-2">
                            <img src={BHALogo} alt="BHA" className="h-7 w-auto object-contain opacity-70" />
                            <Trophy className="w-4 h-4" style={{ color: ADMIN_COLORS.saffron }} />
                            <span className="text-white font-bold text-sm hidden sm:inline">{routePrefix === '/superadmin' ? 'Super Admin' : 'Admin'} Scoring</span>
                            {isLocked && <Lock className="w-4 h-4" style={{ color: ADMIN_COLORS.red }} />}
                        </div>
                    </div>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={isLocked ? { background: `${ADMIN_COLORS.red}20`, color: ADMIN_COLORS.red } : { background: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green }}>
                        {isLocked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red }} />{isConnected ? 'Live' : 'Offline'}</>}
                    </span>
                </div>
            </motion.header>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
                {isLocked && routePrefix === '/superadmin' && (
                    <motion.div className="rounded-2xl border p-4 flex items-center justify-between gap-4"
                        style={{ background: `${ADMIN_COLORS.red}10`, borderColor: `${ADMIN_COLORS.red}30` }}
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: ADMIN_COLORS.red }} />
                            <div>
                                <p className="font-bold text-white text-sm">Scoring session is locked</p>
                                <p className="text-xs mt-0.5 text-white/50">{ageGroupStarted ? 'Age group started. Scores cannot be modified.' : 'Scores saved and locked. Click Unlock to edit.'}</p>
                            </div>
                        </div>
                        {!ageGroupStarted && (
                            <motion.button onClick={handleUnlockScores}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white min-h-[40px] flex-shrink-0"
                                style={{ background: `${ADMIN_COLORS.red}40`, border: `1px solid ${ADMIN_COLORS.red}50` }}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                                <Lock className="w-3.5 h-3.5" /> Unlock
                            </motion.button>
                        )}
                    </motion.div>
                )}

                <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div>
                            <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Scoring Session</p>
                            <h2 className="text-2xl font-black text-white">{selectedGender.label} — {selectedAgeGroup.label}</h2>
                            <div className="mt-2 space-y-1 text-sm text-white/50">
                                <p>Team: <span className="text-white font-semibold">{selectedTeam.name}</span></p>
                                <p>Coach: <span className="text-white/70">{selectedTeam.coach?.name}</span></p>
                                {selectedCompetitionType && <p>Competition: <span className="text-white/70">{selectedCompetitionType.label}</span></p>}
                                {lastUpdated && <p>Last updated: <span className="text-white/40">{lastUpdated.toLocaleString()}</span></p>}
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className="text-xs text-white/40 uppercase tracking-wide">Players</p>
                            <p className="text-4xl font-black" style={{ color: ADMIN_COLORS.saffron }}>{players.length}</p>
                        </div>
                    </div>
                    <div className="mb-6 p-4 rounded-xl border" style={{ background: `${ADMIN_COLORS.purple}10`, borderColor: `${ADMIN_COLORS.purple}30` }}>
                        <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.purpleLight }}>Competition Type</p>
                        <p className="font-bold text-white">{competitionType}</p>
                        <p className="text-xs text-white/40 mt-0.5">
                            {competitionType === 'Competition I' && 'Team: A=4, B=6, C=1'}
                            {competitionType === 'Competition II' && 'Individual: A=1, B=6, C=2'}
                            {competitionType === 'Competition III' && 'Apparatus: A=1, B=6, C=2'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffron }}>Judges Panel</p>
                        {judges.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {judges.map((judge) => {
                                    const isSenior = judge.judgeType === 'Senior Judge';
                                    return (
                                        <div key={judge._id} className="rounded-xl border p-3 text-center"
                                            style={{ background: isSenior ? `${ADMIN_COLORS.purple}12` : `${ADMIN_COLORS.blue}10`, borderColor: isSenior ? `${ADMIN_COLORS.purple}30` : `${ADMIN_COLORS.blue}25` }}>
                                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-2"
                                                style={{ background: isSenior ? `${ADMIN_COLORS.purple}25` : `${ADMIN_COLORS.blue}25`, color: isSenior ? ADMIN_COLORS.purpleLight : '#93C5FD' }}>
                                                {judge.judgeType}
                                            </span>
                                            <p className="font-bold text-white text-sm">{judge.name}</p>
                                            <p className="text-xs text-white/40">@{judge.username}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-white/30 text-sm text-center py-4">No judges found. Please add judges first.</p>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border p-4" style={{ background: `${ADMIN_COLORS.blue}08`, borderColor: `${ADMIN_COLORS.blue}25` }}>
                    <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#93C5FD' }}>Scoring System</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-white/50">
                        <p><span className="text-white/70 font-semibold">Execution Average:</span> From J1–J4. With 4 judges, highest and lowest excluded.</p>
                        <p><span className="text-white/70 font-semibold">Base Score:</span> If diff exceeds tolerance, Base = (Exec + Senior) / 2</p>
                        <p><span className="text-white/70 font-semibold">Tolerance:</span> 9.0+: ±0.10 · 8.0: ±0.20 · 7.0: ±0.30 · 6.0: ±0.40 · 5.0: ±0.50 · Below 5: ±1.00</p>
                        <p><span className="text-white/70 font-semibold">Final Score:</span> Avg Marks − Time Deduction − Other Deduction</p>
                    </div>
                </div>

                {players.length > 0 ? (
                    <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                        <p className="text-xs font-bold tracking-widest uppercase mb-4 flex items-center gap-2" style={{ color: ADMIN_COLORS.saffron }}>
                            <Clock className="w-3.5 h-3.5" /> Player Scoring {isLocked && <Eye className="w-3.5 h-3.5 text-white/30" />}
                        </p>
                        <ResponsiveScoringTable players={players} scores={scores} judges={judges} onScoreChange={handleScoreChange} isLocked={isLocked} />
                    </div>
                ) : (
                    <div className="rounded-2xl border p-8 text-center" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                        <p className="text-white/40">No players found for this category.</p>
                    </div>
                )}

               
                <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {[{ label: 'Time Keeper', value: timeKeeper, setter: setTimeKeeper, placeholder: 'Enter time keeper name', required: true }, { label: 'Scorer', value: scorer, setter: setScorer, placeholder: 'Enter scorer name', required: true }, { label: 'Remarks', value: remarks, setter: setRemarks, placeholder: 'Enter any remarks', required: false }].map(({ label, value, setter, placeholder, required }) => (
                            <div key={label}>
                                <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                                    {label}
                                    {required && <span className="text-red-500 ml-1">*</span>}
                                </label>
                                <input type="text" value={value} onChange={(e) => setter(e.target.value)} disabled={isLocked} placeholder={placeholder} className={darkInput} style={darkInputStyle(isLocked)}
                                    onFocus={(e) => { if (!isLocked) { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; } }}
                                    onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }} />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        {!isLocked ? (
                            <motion.button onClick={handleSaveScores}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white min-h-[48px]"
                                style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)` }}
                                whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }} whileTap={{ scale: 0.97 }}>
                                <Save className="w-4 h-4" /> Save & Lock Scores
                            </motion.button>
                        ) : (
                            <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                <Lock className="w-4 h-4" /> Scores are saved and locked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleConfirmSave}
                title={confirmDialogConfig.title}
                message={confirmDialogConfig.message}
                confirmText={confirmDialogConfig.shouldLock ? 'Lock & Submit' : 'Save Draft'}
                cancelText="Cancel"
                variant={confirmDialogConfig.shouldLock ? 'danger' : 'default'}
            />
        </div>
    );
};

export default AdminScoring;
