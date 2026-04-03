import { useState, useEffect } from 'react';
import { Trophy, Users, UserPlus, Search, Trash2, X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { coachAPI } from '../services/api';
import { useAgeGroups, useAgeGroupValues } from '../hooks/useAgeGroups';
import Dropdown from '../components/Dropdown';
import { CompetitionProvider } from '../contexts/CompetitionContext';
import CompetitionDisplay from '../components/CompetitionDisplay';
import { COLORS, FadeIn, useReducedMotion } from './Home';
import BHALogo from '../assets/BHA.png';

const CoachDashboard = () => {
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const reduced = useReducedMotion();

  const genders = [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
  const ageGroupLimits = {
    'Under10': { minAge: 0, maxAge: 9 }, 'Under12': { minAge: 0, maxAge: 11 },
    'Under14': { minAge: 0, maxAge: 13 }, 'Under16': { minAge: 0, maxAge: 15 },
    'Under18': { minAge: 0, maxAge: 17 }, 'Above16': { minAge: 16, maxAge: 100 },
    'Above18': { minAge: 18, maxAge: 100 },
  };

  const competitionAgeGroups = useAgeGroups(selectedGender?.value || 'Male');
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  useEffect(() => { fetchTeamDashboard(); }, []);
  useEffect(() => { if (selectedGender && selectedPlayerData) setSelectedAgeGroup(null); }, [selectedGender, selectedPlayerData]);

  const calculateAge = (dob) => {
    const today = new Date(), birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const getAvailableAgeGroups = (gender, playerAge) => {
    const ageGroups = competitionAgeGroups.map(ag => ({ ...ag, ...ageGroupLimits[ag.value] }));
    const sorted = [...ageGroups].sort((a, b) => {
      if (a.value.startsWith('Under') && b.value.startsWith('Under')) return a.maxAge - b.maxAge;
      if (a.value.startsWith('Above') && b.value.startsWith('Above')) return a.minAge - b.minAge;
      return a.value.startsWith('Under') ? -1 : 1;
    });
    let idx = -1;
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      if (g.value.startsWith('Under') && playerAge <= g.maxAge) { idx = i; break; }
      if (g.value.startsWith('Above')) { idx = i; break; }
    }
    return idx >= 0 ? sorted.slice(idx) : sorted;
  };

  const fetchTeamDashboard = async () => {
    try {
      const response = await coachAPI.getDashboard();
      setTeam(response.data.team);
    } catch { toast.error('Failed to load team dashboard'); }
    finally { setLoading(false); }
  };

  const handleSearchPlayers = async (query) => {
    if (query.length < 2) { setPlayers([]); return; }
    setSearchLoading(true);
    try {
      const response = await coachAPI.searchPlayers(query);
      setPlayers(response.data.players);
    } catch { toast.error('Failed to search players'); }
    finally { setSearchLoading(false); }
  };

  const handlePlayerSelect = (player) => {
    if (!player.dateOfBirth) { toast.error('Player date of birth is missing.'); return; }
    const age = calculateAge(player.dateOfBirth);
    setSelectedPlayer({ value: player._id, label: `${player.firstName} ${player.lastName}` });
    setSelectedPlayerData({ ...player, age });
    setSelectedGender(genders.find(g => g.value === player.gender));
    setSelectedAgeGroup(null);
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayer || !selectedAgeGroup || !selectedGender || !selectedPlayerData) {
      return toast.error('Please select player and age group');
    }
    const { age } = selectedPlayerData;
    if (selectedAgeGroup.value.startsWith('Under') && age > selectedAgeGroup.maxAge) {
      return toast.error(`Player is ${age} years old and cannot play in ${selectedAgeGroup.label} (max: ${selectedAgeGroup.maxAge})`);
    }
    try {
      await coachAPI.addPlayerToAgeGroup({ playerId: selectedPlayer.value, ageGroup: selectedAgeGroup.value, gender: selectedGender.value });
      toast.success('Player added to age group successfully!');
      handleCloseModal();
      fetchTeamDashboard();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to add player'); }
  };

  const handleCloseModal = () => {
    setShowAddPlayer(false); setSelectedPlayer(null); setSelectedPlayerData(null);
    setSelectedAgeGroup(null); setSelectedGender(null); setSearchQuery(''); setPlayers([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from the age group?')) return;
    try {
      await coachAPI.removePlayerFromAgeGroup(playerId);
      toast.success('Player removed successfully!');
      fetchTeamDashboard();
    } catch { toast.error('Failed to remove player'); }
  };

  const getAgeGroupDisplay = (ag) => ({
    'Under10': 'Under 10', 'Under12': 'Under 12', 'Under14': 'Under 14',
    'Under16': 'Under 16', 'Under18': 'Under 18', 'Above18': 'Above 18', 'Above16': 'Above 16',
  }[ag] || ag);

  const getPlayersByAgeGroup = () => {
    if (!team?.players) return {};
    return team.players.reduce((acc, p) => {
      const key = `${p.gender}_${p.ageGroup}`;
      acc[key] = [...(acc[key] || []), p];
      return acc;
    }, {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }} />
          <p className="text-white/45 text-sm">Loading team dashboard...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="max-w-4xl mx-auto px-4 py-10">
          <CompetitionProvider userType="coach">
            <CompetitionDisplay className="mb-8" />
          </CompetitionProvider>
          <div className="rounded-3xl border p-12 text-center"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <Trophy className="w-16 h-16 mx-auto mb-4 text-white/20" aria-hidden="true" />
            <h2 className="text-2xl font-black text-white mb-2">No Team Registered</h2>
            <p className="text-white/45 mb-6">You don't have a team registered for this competition yet.</p>
            <button onClick={() => window.location.href = '/coach/select-competition'}
              className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px] inline-flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
              <Trophy className="w-4 h-4" aria-hidden="true" />
              Select Team for Competition
            </button>
          </div>
        </div>
      </div>
    );
  }

  const playersByAgeGroup = getPlayersByAgeGroup();

  const AgeGroupCard = ({ ageGroup, gender, accentColor }) => {
    const key = `${gender}_${ageGroup}`;
    const groupPlayers = playersByAgeGroup[key] || [];
    return (
      <div className="rounded-xl border p-4"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: COLORS.darkBorderSubtle }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-semibold text-sm">{getAgeGroupDisplay(ageGroup)} {gender === 'Male' ? 'Boys' : 'Girls'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30` }}>
            {groupPlayers.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {groupPlayers.map((player, idx) => (
            <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-white/70 text-sm truncate flex-1">
                {player.player.firstName} {player.player.lastName}
              </span>
              <button onClick={() => handleRemovePlayer(player.player._id)}
                disabled={team?.isSubmitted}
                className="ml-2 p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                style={{ color: team?.isSubmitted ? 'rgba(255,255,255,0.2)' : '#EF4444' }}
                title={team?.isSubmitted ? 'Cannot remove after submission' : 'Remove player'}
                aria-label={`Remove ${player.player.firstName} ${player.player.lastName}`}>
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {groupPlayers.length === 0 && (
            <p className="text-white/20 text-xs italic px-1">No players assigned</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <CompetitionProvider userType="coach">
          <CompetitionDisplay className="mb-8" />
        </CompetitionProvider>

        {/* Header card */}
        <FadeIn className="mb-6">
          <div className="rounded-3xl border p-6 md:p-8"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}28` }}>
                  <Trophy className="w-7 h-7" style={{ color: COLORS.saffron }} aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white">{team.name}</h1>
                  <p className="text-white/40 text-sm">Team Dashboard</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <motion.button onClick={() => setShowAddPlayer(true)}
                  disabled={team?.isSubmitted}
                  className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}
                  whileHover={team?.isSubmitted ? {} : { scale: 1.02 }}
                  whileTap={team?.isSubmitted ? {} : { scale: 0.98 }}>
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add Player
                </motion.button>
                <motion.button onClick={() => setShowTeamSummary(true)}
                  disabled={!team?.players?.length || team?.isSubmitted}
                  className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
                  whileHover={(!team?.players?.length || team?.isSubmitted) ? {} : { scale: 1.02 }}
                  whileTap={(!team?.players?.length || team?.isSubmitted) ? {} : { scale: 0.98 }}>
                  <Trophy className="w-4 h-4" aria-hidden="true" />
                  {team?.isSubmitted ? 'Team Submitted' : 'Submit Team'}
                </motion.button>
              </div>
            </div>
            {team.description && <p className="mt-4 text-white/40 text-sm">{team.description}</p>}
            {team?.isSubmitted && (
              <div className="mt-4 p-3 rounded-xl flex items-center gap-2"
                style={{ background: `${COLORS.saffron}10`, border: `1px solid ${COLORS.saffron}25` }}>
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
                <p className="text-sm" style={{ color: COLORS.saffronLight }}>
                  Team has been submitted. Contact Admin to make changes.
                </p>
              </div>
            )}
          </div>
        </FadeIn>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { icon: Users, label: 'Total Players', value: team.players?.length || 0, color: '#3B82F6' },
            { icon: Trophy, label: 'Age Groups', value: Object.keys(playersByAgeGroup).length, color: COLORS.saffron },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <FadeIn key={label} delay={i * 0.05}>
              <div className="rounded-2xl border p-5 flex items-center gap-4"
                style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}18` }}>
                  <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-black text-white">{value}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Age group grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FadeIn delay={0.1}>
            <div className="rounded-3xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" aria-hidden="true" />
                Boys Age Groups
              </h2>
              <div className="space-y-3">
                {maleAgeGroupValues.map(ag => (
                  <AgeGroupCard key={ag} ageGroup={ag} gender="Male" accentColor="#3B82F6" />
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="rounded-3xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" aria-hidden="true" />
                Girls Age Groups
              </h2>
              <div className="space-y-3">
                {femaleAgeGroupValues.map(ag => (
                  <AgeGroupCard key={ag} ageGroup={ag} gender="Female" accentColor="#EC4899" />
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Team Summary Modal */}
      <AnimatePresence>
        {showTeamSummary && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowTeamSummary(false)} />
            <motion.div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border"
              style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
              <div className="sticky top-0 flex items-center justify-between p-6 border-b"
                style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}>
                <h3 className="text-xl font-black text-white">Team Summary — {team.name}</h3>
                <button onClick={() => setShowTeamSummary(false)}
                  className="p-2 rounded-xl text-white/40 hover:text-white/70 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={{ border: `1px solid ${COLORS.darkBorderSubtle}` }} aria-label="Close">
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                  <p className="text-white/70 text-sm"><span className="text-white font-semibold">Team:</span> {team.name}</p>
                  <p className="text-white/70 text-sm mt-1"><span className="text-white font-semibold">Total Players:</span> {team.players?.length || 0}</p>
                  {team?.isSubmitted && (
                    <div className="mt-3 flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: `${COLORS.saffron}10`, border: `1px solid ${COLORS.saffron}25` }}>
                      <CheckCircle className="w-4 h-4" style={{ color: COLORS.saffron }} aria-hidden="true" />
                      <p className="text-sm" style={{ color: COLORS.saffronLight }}>Team Submitted</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[{ label: 'Boys', values: maleAgeGroupValues, gender: 'Male', color: '#3B82F6' },
                    { label: 'Girls', values: femaleAgeGroupValues, gender: 'Female', color: '#EC4899' }].map(({ label, values, gender, color }) => (
                    <div key={gender}>
                      <h4 className="font-bold text-sm mb-3" style={{ color }}>{label} Age Groups</h4>
                      <div className="space-y-2">
                        {values.map(ag => {
                          const gPlayers = playersByAgeGroup[`${gender}_${ag}`] || [];
                          return (
                            <div key={ag} className="p-3 rounded-xl border"
                              style={{ background: 'rgba(255,255,255,0.02)', borderColor: COLORS.darkBorderSubtle }}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-white text-sm font-semibold">{getAgeGroupDisplay(ag)}</span>
                                <span className="text-white/40 text-xs">{gPlayers.length} players</span>
                              </div>
                              {gPlayers.length > 0
                                ? gPlayers.map((p, i) => <p key={i} className="text-white/55 text-xs">{p.player.firstName} {p.player.lastName}</p>)
                                : <p className="text-white/20 text-xs italic">No players</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-4 border-t" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <button onClick={() => setShowTeamSummary(false)}
                    className="px-6 py-3 rounded-xl text-white/60 hover:text-white/80 border transition-colors min-h-[44px]"
                    style={{ borderColor: COLORS.darkBorderSubtle }}>
                    Cancel
                  </button>
                  {team?.isSubmitted ? (
                    <div className="px-6 py-3 rounded-xl text-center min-h-[44px] flex items-center justify-center"
                      style={{ background: `${COLORS.saffron}15`, color: COLORS.saffronLight, border: `1px solid ${COLORS.saffron}30` }}>
                      Team Already Submitted
                    </div>
                  ) : (
                    <button onClick={() => { setShowTeamSummary(false); window.location.href = '/coach/payment'; }}
                      className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px]"
                      style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
                      Proceed to Payment
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Player Modal */}
      <AnimatePresence>
        {showAddPlayer && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              onClick={handleCloseModal} />
            <motion.div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border"
              style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
              <div className="sticky top-0 flex items-center justify-between p-6 border-b"
                style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}>
                <h3 className="text-lg font-black text-white">Add Player to Age Group</h3>
                <button onClick={handleCloseModal}
                  className="p-2 rounded-xl text-white/40 hover:text-white/70 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={{ border: `1px solid ${COLORS.darkBorderSubtle}` }} aria-label="Close">
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* Search */}
                <div>
                  <label htmlFor="player-search" className="block text-xs font-semibold tracking-wide uppercase mb-2"
                    style={{ color: COLORS.saffronLight }}>Search Players</label>
                  <div className="relative">
                    <input id="player-search" type="text" value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); handleSearchPlayers(e.target.value); }}
                      className="w-full px-4 py-3 pr-10 rounded-xl text-white placeholder-white/25 outline-none min-h-[44px]"
                      style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.darkBorderSubtle}` }}
                      onFocus={e => e.target.style.borderColor = COLORS.saffron}
                      onBlur={e => e.target.style.borderColor = COLORS.darkBorderSubtle}
                      placeholder="Search by name" />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
                  </div>
                  {searchLoading && <p className="text-white/30 text-xs mt-1">Searching...</p>}
                  {players.length > 0 && (
                    <div className="mt-2 rounded-xl border overflow-hidden max-h-40 overflow-y-auto"
                      style={{ borderColor: COLORS.darkBorderSubtle }}>
                      {players.map((player, i) => (
                        <button key={i} onClick={() => handlePlayerSelect(player)}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 border-b last:border-b-0 transition-colors min-h-[44px]"
                          style={{ borderColor: COLORS.darkBorderSubtle }}>
                          <p className="text-white font-medium text-sm">{player.firstName} {player.lastName}</p>
                          <p className="text-white/40 text-xs">{player.email} · {player.gender} · Age: {player.dateOfBirth ? calculateAge(player.dateOfBirth) : 'Unknown'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPlayer && selectedPlayerData && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                      <p className="text-white font-semibold text-sm">{selectedPlayer.label}</p>
                      <p className="text-white/45 text-xs mt-1">
                        Gender: {selectedPlayerData.gender} · Age: {selectedPlayerData.age} yrs · DOB: {new Date(selectedPlayerData.dateOfBirth).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide uppercase mb-2"
                        style={{ color: COLORS.saffronLight }}>Gender (Auto-selected)</label>
                      <div className="px-4 py-3 rounded-xl text-white/50 min-h-[44px] flex items-center"
                        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                        {selectedGender?.label || 'Loading...'}
                      </div>
                      <p className="text-white/25 text-xs mt-1">Automatically set from player's registration</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide uppercase mb-2"
                        style={{ color: COLORS.saffronLight }}>
                        Age Group <span aria-hidden="true" style={{ color: COLORS.saffron }}>*</span>
                      </label>
                      <Dropdown
                        options={selectedGender && selectedPlayerData ? getAvailableAgeGroups(selectedGender.value, selectedPlayerData.age) : []}
                        value={selectedAgeGroup}
                        onChange={setSelectedAgeGroup}
                        placeholder="Select age group"
                      />
                      <p className="text-white/25 text-xs mt-1">
                        Player age: {selectedPlayerData.age} yrs. Showing eligible categories.
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={handleCloseModal}
                        className="flex-1 py-3 rounded-xl text-white/60 hover:text-white/80 border transition-colors min-h-[44px]"
                        style={{ borderColor: COLORS.darkBorderSubtle }}>
                        Cancel
                      </button>
                      <button onClick={handleAddPlayer}
                        disabled={!selectedPlayer || !selectedAgeGroup || !selectedGender}
                        className="flex-1 py-3 rounded-xl font-bold text-white min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}>
                        Add Player
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CoachDashboard;
