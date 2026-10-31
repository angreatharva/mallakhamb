// AdminScoring.jsx - Dark theme version
import { useState, useEffect } from 'react';
import apiConfig from '@/config/api.config';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, Save, ArrowLeft, Lock, Eye, Trophy, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '@/services/api';
import { ResponsiveScoringTable } from '../../components/responsive/ResponsiveTable';
import { useRouteContext } from '../../contexts/RouteContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { calculateAverageMarks, getTimeDeductionForTime } from '@/utils/scoring/copRules';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { getRoleFromPath } from '@/utils/auth/roleFromPath';
import { DATA_COLORS, FG, alpha } from '../../styles/tokens';
import { PoleMark } from '@/components/brand/Brand';
import ConfirmDialog from '@/components/auth/ConfirmDialog';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import { apparatusFor, entryGender } from '@/utils/scoring/apparatus';
import { panelSeats, soleApparatus } from '@/utils/scoring/judgePanel';
import { sheetRows, rowFor, playerScoresFor } from '@/utils/scoring/adminSheet';
import AppearanceMenu from '@/components/layout/AppearanceMenu';
import { ageMatches } from '@/hooks/useAgeGroups';

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
    /*
     * Two different reasons this sheet can be read-only. `isLocked` means THIS
     * entry was saved and finalized — and an admin can still unlock it. The
     * competition lock means the whole MEET closed at 23:59 UTC on its end
     * date, which an admin cannot undo at all. `readOnly` is the union.
     *
     * On /superadmin/scoring the hook returns false by design: a super admin
     * keeps every write, so only `isLocked` applies to them.
     */
    const { locked: competitionLocked } = useCompetitionLock();
    const readOnly = isLocked || competitionLocked;
    const [existingScoreId, setExistingScoreId] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [ageGroupStarted, setAgeGroupStarted] = useState(false);
    const [competitionType, setCompetitionType] = useState('Competition I');
    const [calculatedScores, setCalculatedScores] = useState([]);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [confirmDialogConfig, setConfirmDialogConfig] = useState({ title: '', message: '', shouldLock: false });

    useEffect(() => {
        const socketUrl = apiConfig.getSocketUrl();
        // Both branches of this ternary used to read 'admin_token'. Storage is
        // role-scoped, so on /superadmin/scoring that key is empty and the socket
        // handshake went out with token: null — the superadmin's live score feed
        // then fell back to the access_token cookie, which is not sent cross-site
        // in production. Derived from the same roleFromPath map the api-client
        // uses, so the socket and the HTTP calls cannot disagree about identity.
        const tokenKey = `${getRoleFromPath(routePrefix) ?? 'admin'}_token`;
        const token = secureStorage.getItem(tokenKey);
        
        // Connect with authentication token
        const newSocket = io(socketUrl, {
            auth: {
                token: token
            },
            withCredentials: true
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
            // The row is the athlete on THIS apparatus (utils/scoring/adminSheet).
            const rowId = rowFor(players, data);
            if (!rowId) return;
            const fieldMap = { 'Senior Judge': 'seniorJudge', 'Judge 1': 'judge1', 'Judge 2': 'judge2', 'Judge 3': 'judge3', 'Judge 4': 'judge4' };
            const fieldName = fieldMap[data.judgeType] || 'seniorJudge';
            
            setScores(prev => {
                const player = prev[rowId] || {};
                const difficulties = { ...(player.difficulties || {}) };
                
                // Store this judge's difficulty if it exists in the payload
                if (data.breakdown?.difficulty?.total !== undefined) {
                    difficulties[fieldName] = data.breakdown.difficulty.total;
                }
                
                return { 
                    ...prev, 
                    [rowId]: { 
                        ...player, 
                        [fieldName]: data.score.toString(),
                        difficulties
                    } 
                };
            });
            
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
        socket.on('scores_saved_error', handleScoresSavedError);
        
        return () => { 
            socket.off('score_updated', handleScoreUpdate); 
            socket.off('scores_saved_notification', handleScoresSaved); 
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
            /*
             * ONE APPARATUS' PANEL. A category holds one panel per apparatus
             * now, so without this filter every one of them comes back at once
             * and `judges.length` — which picks the averaging method further
             * down — counts them all. See utils/scoring/judgePanel.js.
             *
             * The apparatus is the one this squad is entered for, when they are
             * all entered for the same; a squad spanning several has no single
             * panel and `panelSeats` folds them to one seat per role.
             */
            const teamApparatus = soleApparatus(
                (selectedTeam.players || [])
                    .filter(pe => entryGender(pe) === selectedGender.value && ageMatches(pe.ageGroup, selectedAgeGroup.value))
                    .flatMap(pe => apparatusFor(pe, selectedCompetitionType?.value).map(a => ({ apparatus: a })))
            );

            const judgesParams = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value };
            if (selectedCompetitionType?.value) judgesParams.competitionTypes = selectedCompetitionType.value;
            if (teamApparatus) judgesParams.apparatus = teamApparatus;
            // Add competition ID for superadmin
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                judgesParams.competition = currentCompetition._id;
            }

            const judgesResponse = await api.getJudges(judgesParams);
            const judgesData = judgesResponse.data.data || judgesResponse.data;
            const allAssigned = (Array.isArray(judgesData) ? judgesData : []).filter(j => !j.isEmpty && j.name?.trim());
            setJudges(panelSeats(judgesData, teamApparatus));

            const sc = allAssigned.find(j => j.judgeType === 'Scorer');
            if (sc?.name) setScorer((prev) => prev || sc.name);
            
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
            
            /*
             * One row per athlete PER APPARATUS, keyed `playerId|apparatus`.
             * A row per athlete saved without the apparatus overwrote each
             * athlete's Pole result with another apparatus' marks and left only
             * Pole locked (utils/scoring/adminSheet).
             */
            const teamPlayers = sheetRows(selectedTeam, selectedGender.value, selectedAgeGroup.value, selectedCompetitionType?.value);
            setPlayers(teamPlayers);
            const initialScores = {};
            teamPlayers.forEach(p => { initialScores[p.id] = { time: '', seniorJudge: '', judge1: '', judge2: '', judge3: '', judge4: '', deduction: '', otherDeduction: '', difficulties: {} }; });
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
            
            // This competition type only: without it Competition I and II rows
            // were loaded onto the same inputs.
            const scoresParams = { teamId, gender, ageGroup };
            if (selectedCompetitionType?.value) scoresParams.competitionType = selectedCompetitionType.value;
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
                /*
                 * ANY locked apparatus locks this sheet, unlike the Scorer's.
                 *
                 * A Scorer works one apparatus at a time — their sheet is
                 * narrowed to the apparatus their panel is seated for, so it
                 * can go on accepting the others after one is locked. This
                 * screen is not narrowed: it lists every apparatus the squad is
                 * entered for and posts them all in one payload. Once Pole is
                 * locked, `saveScores` refuses a write naming it, which would
                 * fail the whole save including the Rope rows beside it.
                 *
                 * So it stays closed as soon as anything is locked, which is
                 * exactly how it behaved when the lock was a single flag. An
                 * admin who needs it open again has the unlock.
                 */
                const anyApparatusLocked = (scoreMetadata.lockedApparatus || []).length > 0;
                logger.info('Setting isLocked to:', scoreMetadata.isLocked, 'lockedApparatus:', scoreMetadata.lockedApparatus);
                setIsLocked(!!scoreMetadata.isLocked || anyApparatusLocked);
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
                // Same athlete AND same apparatus — never just the athlete.
                const targetId = rowFor(currentPlayers, ps);
                
                logger.info('Mapping player score:', { 
                    playerName: ps.playerName, 
                    playerId: ps.playerId,
                    targetId, 
                    judgeScores: ps.judgeScores,
                    time: ps.time,
                    currentPlayers: currentPlayers.map(p => ({ id: p.id, name: p.name }))
                });
                
                if (targetId && existingScores[targetId]) {
                    const difficulties = {};
                    if (ps.judgeSlips && Array.isArray(ps.judgeSlips)) {
                        ps.judgeSlips.forEach(slip => {
                            const judgeMap = { 'SR_JUDGE': 'seniorJudge', 'J1': 'judge1', 'J2': 'judge2', 'J3': 'judge3', 'J4': 'judge4' };
                            const fieldName = judgeMap[slip.judgeRole];
                            if (fieldName && slip.difficultyScore !== undefined) {
                                difficulties[fieldName] = slip.difficultyScore;
                            }
                        });
                    }
                    
                    existingScores[targetId] = { 
                        time: ps.time || '', 
                        seniorJudge: ps.judgeScores?.seniorJudge !== undefined && ps.judgeScores?.seniorJudge !== null ? ps.judgeScores.seniorJudge.toString() : '', 
                        judge1: ps.judgeScores?.judge1 !== undefined && ps.judgeScores?.judge1 !== null ? ps.judgeScores.judge1.toString() : '', 
                        judge2: ps.judgeScores?.judge2 !== undefined && ps.judgeScores?.judge2 !== null ? ps.judgeScores.judge2.toString() : '', 
                        judge3: ps.judgeScores?.judge3 !== undefined && ps.judgeScores?.judge3 !== null ? ps.judgeScores.judge3.toString() : '', 
                        judge4: ps.judgeScores?.judge4 !== undefined && ps.judgeScores?.judge4 !== null ? ps.judgeScores.judge4.toString() : '', 
                        deduction: ps.deduction !== undefined && ps.deduction !== null ? ps.deduction.toString() : '', 
                        otherDeduction: ps.otherDeduction !== undefined && ps.otherDeduction !== null ? ps.otherDeduction.toString() : '',
                        difficulties
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

    /*
     * Panel averaging comes from copRules, the same module the judge pages and
     * the score table use. The private copy that used to live here took the
     * MEDIAN of three execution marks where copRules took the mean, so a
     * 4-judge panel showed one number in the table and posted another. The
     * panel-size rules belong in one place.
     *
     * The seated panel is passed in rather than inferred: a half-entered
     * 5-judge sheet has three marks on it and would otherwise be scored as a
     * 3-judge panel.
     */
    const panelAverage = (playerScores) => calculateAverageMarks(playerScores, judges.length || undefined);
    const calculateFinalScore = (ps) => { const r = panelAverage(ps); return Math.max(0, r.average - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2); };

    const handleScoreChange = (playerId, field, value) => {
        if (readOnly) { toast.error(isLocked ? 'Cannot edit scores - this entry is locked' : 'This competition has closed. Scores can no longer be changed.'); return; }
        
        setScores(prev => {
            const updatedPlayer = { ...prev[playerId], [field]: value };
            
            // Auto-calculate time deduction when time changes
            if (field === 'time') {
                const timeStr = value.trim();
                let seconds = 0;
                if (timeStr.includes(':')) {
                    const [m, s] = timeStr.split(':');
                    seconds = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
                } else {
                    seconds = parseInt(timeStr) || 0;
                }
                
                // Only calculate deduction if time is valid and > 90s
                if (seconds > 0) {
                    // Short of 60 s or over 90 s — the same table both ways.
                    const deduction = getTimeDeductionForTime(seconds);
                    
                    // Always set the calculated deduction so it shows up in UI immediately
                    updatedPlayer.deduction = deduction > 0 ? deduction.toFixed(2) : '';
                } else if (timeStr === '') {
                    updatedPlayer.deduction = '';
                }
            }
            
            return { ...prev, [playerId]: updatedPlayer };
        });
        setLastUpdated(new Date());
    };

    const handleSaveScores = async () => {
        if (isLocked) { toast.error('Cannot save - this entry is already locked'); return; }
        if (competitionLocked) { toast.error('This competition has closed. Scores can no longer be changed.'); return; }
        
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
        
        // Validation: Difficulty Mismatch
        if (shouldLock) {
            const mismatchedPlayers = players.filter(p => {
                const ps = scores[p.id];
                if (!ps || !ps.difficulties) return false;
                const diffValues = Object.values(ps.difficulties).filter(v => v !== undefined && v !== null);
                if (diffValues.length > 1) {
                    const firstDiff = diffValues[0];
                    return !diffValues.every(v => v === firstDiff);
                }
                return false;
            });
            
            if (mismatchedPlayers.length > 0) {
                const names = mismatchedPlayers.map(p => p.name).join(', ');
                toast.error(`Cannot lock scores. Difficulty values mismatch between judges for: ${names}`);
                return;
            }
        }
        
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
                playerScores: playerScoresFor(players, scores, panelAverage, calculateFinalScore),
                // Who sat, by name and seat. No email: this record is served
                // by the anonymous results feed, and a judge's email is their
                // login (security audit 2026-10-31, M1).
                judgeDetails: judges.map(j => ({ judgeId: j._id, judgeName: j.name, judgeType: j.judgeType }))
            };
            
            // Add competition ID for superadmin
            if (routePrefix === '/superadmin' && currentCompetition?._id) {
                scoringData.competition = currentCompetition._id;
            }
            
            const response = await api.saveScores(scoringData);
            
            // Extract calculated scores from backend response (Requirement 5.1, 5.2)
            // Backend returns { success: true, data: { scoreId, isLocked, playerScores } }
            const responseData = response.data.data || response.data;
            const {
                scoreId, isLocked: responseLocked, lockedApparatus, playerScores: calculatedPlayerScores,
            } = responseData;

            // Update local state with calculated values
            setCalculatedScores(calculatedPlayerScores || []);
            // Same rule as the load above: a lock on any apparatus closes this
            // sheet, because it posts every apparatus in one payload.
            setIsLocked(!!responseLocked || (lockedApparatus || []).length > 0);
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

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-bg">
                <div className="text-center">
                    <div className="w-10 h-10 border-2 border-ink/10 rounded-full mx-auto mb-4 animate-spin border-t-accent"/>
                    <p className="text-fg-muted text-sm">Loading scoring page…</p>
                </div>
            </div>
        );
    }

    if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-bg">
                <div className="text-center">
                    <p className="text-fg-muted mb-4">Invalid scoring session. Please go back and select a team.</p>
                    <button onClick={() => navigate(`${routePrefix}/dashboard/scores`)} className="ui-btn ui-btn--line">
                        Back to Scores
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-bg text-fg">
            <header className="sticky top-0 z-40 border-b bg-bg border-line">
                <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(`${routePrefix}/dashboard/scores`)} className="flex items-center gap-2 text-sm font-semibold min-h-[44px] tap-safe justify-center px-3 rounded-lg hover:bg-ink/10 transition-colors text-ink/60 hover:text-ink">
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Back to Scores</span>
                        </button>
                        <div className="w-px h-5 bg-ink/10" />
                        <div className="flex items-center gap-2">
                            <PoleMark className="h-7 w-auto opacity-70" />
                            <Trophy className="w-4 h-4 text-accent-fg"/>
                            <span className="text-ink font-bold text-sm hidden sm:inline">{routePrefix === '/superadmin' ? 'Super Admin' : 'Admin'} Scoring</span>
                            {isLocked && <Lock className="w-4 h-4 text-danger-fg"/>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={isLocked ? { background: `${alpha('rgb(var(--danger-fg))', 0x20)}`, color: FG.danger } : { background: `${alpha('rgb(var(--success-fg))', 0x20)}`, color: FG.success }}>
                        {isLocked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? 'rgb(var(--success-fg))' : 'rgb(var(--danger-fg))' }} />{isConnected ? 'Live' : 'Offline'}</>}
                    </span>
                    <AppearanceMenu />
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
                <CompetitionLockBanner />

                {isLocked && routePrefix === '/superadmin' && (
                    <div className="rounded-2xl border p-4 flex items-center justify-between gap-4 bg-surface-sunken border-line">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 text-danger-fg"/>
                            <div>
                                <p className="font-bold text-ink text-sm">Scoring session is locked</p>
                                <p className="text-xs mt-0.5 text-fg-muted">{ageGroupStarted ? 'Age group started. Scores cannot be modified.' : 'Scores saved and locked. Click Unlock to edit.'}</p>
                            </div>
                        </div>
                        {!ageGroupStarted && (
                            <button onClick={handleUnlockScores} className="ui-btn ui-btn--danger ui-btn--sm flex-shrink-0">
                                <Lock className="w-3.5 h-3.5" /> Unlock
                            </button>
                        )}
                    </div>
                )}

                <div className="rounded-2xl border p-6 bg-surface border-line">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div>
                            <p className="type-tag mb-1 text-accent-fg">Scoring Session</p>
                            <h2 className="text-2xl font-black text-ink">{selectedGender.label} — {selectedAgeGroup.label}</h2>
                            <div className="mt-2 space-y-1 text-sm text-fg-muted">
                                <p>Team: <span className="text-ink font-semibold">{selectedTeam.name}</span></p>
                                <p>Coach: <span className="text-ink/70">{selectedTeam.coach?.name}</span></p>
                                {selectedCompetitionType && <p>Competition: <span className="text-ink/70">{selectedCompetitionType.label}</span></p>}
                                {lastUpdated && <p>Last updated: <span className="text-fg-muted">{lastUpdated.toLocaleString()}</span></p>}
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className="text-xs text-fg-muted uppercase tracking-wide">Players</p>
                            <p className="text-4xl font-black text-accent-fg">{new Set(players.map((p) => p.playerId)).size}</p>
                        </div>
                    </div>
                    <div className="mb-6 p-4 rounded-xl border bg-surface-sunken border-line">
                        <p className="type-tag mb-1 text-fg-secondary">Competition Type</p>
                        <p className="font-bold text-ink">{competitionType}</p>
                        <p className="text-xs text-fg-muted mt-0.5">
                            {competitionType === 'Competition I' && 'Team: A=4, B=6, C=1'}
                            {competitionType === 'Competition II' && 'Individual: A=1, B=6, C=2'}
                            {competitionType === 'Competition III' && 'Apparatus: A=1, B=6, C=2'}
                        </p>
                    </div>
                    <div>
                        <p className="type-tag mb-3 text-accent-fg">Judges Panel</p>
                        {judges.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {judges.map((judge) => {
                                    const isSenior = judge.judgeType === 'Senior Judge';
                                    return (
                                        <div key={judge._id} className="rounded-xl border p-3 text-center"
                                            style={{ background: isSenior ? `${alpha('rgb(var(--accent))', 0x12)}` : `${alpha('rgb(var(--info-fg))', 0x10)}`, borderColor: isSenior ? `${alpha('rgb(var(--accent))', 0x30)}` : `${alpha('rgb(var(--info-fg))', 0x25)}` }}>
                                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-2"
                                                style={{ background: isSenior ? `${alpha('rgb(var(--accent))', 0x25)}` : `${alpha('rgb(var(--info-fg))', 0x25)}`, color: isSenior ? 'rgb(var(--accent-fg))' : DATA_COLORS.blueSoft }}>
                                                {judge.judgeType}
                                            </span>
                                            <p className="font-bold text-ink text-sm">{judge.name}</p>
                                            <p className="text-xs text-fg-muted">{judge.email}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-fg-muted text-sm text-center py-4">No judges found. Please add judges first.</p>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border p-4 bg-surface-sunken border-line">
                    <p className="type-tag mb-2 text-fg-secondary">Scoring System</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-fg-muted">
                        <p><span className="text-ink/70 font-semibold">Execution Average:</span> From J1–J4. With 4 judges, highest and lowest excluded.</p>
                        <p><span className="text-ink/70 font-semibold">Base Score:</span> If diff exceeds tolerance, Base = (Exec + Senior) / 2</p>
                        <p><span className="text-ink/70 font-semibold">Tolerance:</span> 9.0+: ±0.10 · 8.0: ±0.20 · 7.0: ±0.30 · 6.0: ±0.40 · 5.0: ±0.50 · Below 5: ±1.00</p>
                        <p><span className="text-ink/70 font-semibold">Final Score:</span> Avg Marks − Time Deduction − Other Deduction</p>
                    </div>
                </div>

                {players.length > 0 ? (
                    <div className="rounded-2xl border p-6 bg-surface border-line">
                        <p className="type-tag mb-4 flex items-center gap-2 text-accent-fg">
                            <Clock className="w-3.5 h-3.5" /> Player Scoring {isLocked && <Eye className="w-3.5 h-3.5 text-ink/30" />}
                        </p>
                        <ResponsiveScoringTable players={players} scores={scores} judges={judges} onScoreChange={handleScoreChange} isLocked={readOnly} />
                    </div>
                ) : (
                    <div className="rounded-2xl border p-8 text-center bg-surface border-line">
                        <p className="text-fg-muted">No players found for this category.</p>
                    </div>
                )}

               
                <div className="rounded-2xl border p-6 bg-surface border-line">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {[{ label: 'Time Keeper', value: timeKeeper, setter: setTimeKeeper, placeholder: 'Enter time keeper name', required: true }, { label: 'Scorer', value: scorer, setter: setScorer, placeholder: 'Enter scorer name', required: true }, { label: 'Remarks', value: remarks, setter: setRemarks, placeholder: 'Enter any remarks', required: false }].map(({ label, value, setter, placeholder, required }) => (
                            <div key={label}>
                                <label htmlFor={`official-${label.toLowerCase().replace(/\s+/g, '-')}`} className="block type-tag mb-2 text-accent-fg">
                                    {label}
                                    {required && <span className="text-red-700 dark:text-red-500 ml-1">*</span>}
                                </label>
                                <input id={`official-${label.toLowerCase().replace(/\s+/g, '-')}`} type="text" value={value} onChange={(e) => setter(e.target.value)} disabled={readOnly} placeholder={placeholder} className="ui-input" />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        {!readOnly ? (
                            <button onClick={handleSaveScores} className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-ink min-h-[48px] bg-accent text-on-accent">
                                <Save className="w-4 h-4" /> Save & Lock Scores
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-fg-muted">
                                <Lock className="w-4 h-4" />
                                {isLocked ? 'Scores are saved and locked' : 'This competition has closed'}
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
