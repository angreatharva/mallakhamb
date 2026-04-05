import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, MapPin, ArrowRight, User, LogOut, Search, X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { coachAPI } from '../../services/api';
import apiConfig from '../../utils/apiConfig.js';
import { secureStorage } from '../../utils/secureStorage.js';
import { logger } from '../../utils/logger';
import { COLORS, GradientText, useReducedMotion } from '../public/Home';
import BHALogo from '../../assets/BHA.png';

const CoachSelectCompetition = () => {
  const [competitions, setCompetitions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  useEffect(() => {
    const userData = secureStorage.getItem('coach_user');
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch (e) { logger.error('Failed to parse user data:', e); }
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [competitionsRes, teamsRes] = await Promise.all([
        coachAPI.getOpenCompetitions(),
        coachAPI.getTeams()
      ]);
      setCompetitions(competitionsRes.data.competitions || []);
      setTeams(teamsRes.data.teams || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompetition = async () => {
    if (!selectedCompetition) return toast.error('Please select a competition');
    if (!selectedTeam) return toast.error('Please select a team to register');

    setSubmitting(true);
    try {
      await coachAPI.registerTeamForCompetition(selectedTeam, selectedCompetition);
      const token = secureStorage.getItem('coach_token');
      const authResponse = await fetch(`${apiConfig.getBaseUrl()}/auth/set-competition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ competitionId: selectedCompetition }),
      });
      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        throw new Error(errorData.message || 'Failed to set competition context');
      }
      const authData = await authResponse.json();
      secureStorage.setItem('coach_token', authData.token);
      toast.success('Team registered for competition successfully!');
      window.location.href = '/coach/dashboard';
    } catch (error) {
      logger.error('Competition selection error:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to register team');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status) => {
    if (status === 'ongoing') return { bg: '#22C55E18', border: '#22C55E40', color: '#22C55E' };
    if (status === 'upcoming') return { bg: '#3B82F618', border: '#3B82F640', color: '#60A5FA' };
    return { bg: 'rgba(255,255,255,0.05)', border: COLORS.darkBorderSubtle, color: 'rgba(255,255,255,0.4)' };
  };

  const filteredCompetitions = competitions.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [c.name, c.place, c.level, c.status, c.description].some(v => v?.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }} />
          <p className="text-white/45 text-sm">Loading competitions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Navbar */}
      <header className="border-b fixed top-0 left-0 right-0 z-40"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain" />
            <span className="text-white font-bold text-sm hidden sm:block">Mallakhamb</span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                <User className="w-4 h-4 text-white/40" aria-hidden="true" />
                <span className="text-white/70 text-sm">{user.name || user.firstName || 'Coach'}</span>
              </div>
            )}
            <button
              onClick={() => {
                secureStorage.removeItem('coach_token');
                secureStorage.removeItem('coach_user');
                navigate('/coach/login');
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/50 hover:text-white/80 transition-colors min-h-[44px]"
              style={{ border: `1px solid ${COLORS.darkBorderSubtle}` }}>
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm hidden sm:block">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 pt-24">
        {/* Header */}
        <motion.div className="text-center mb-10"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-4 border"
            style={{ background: `${COLORS.saffron}18`, borderColor: `${COLORS.saffron}45`, color: COLORS.saffronLight }}>
            <Trophy className="w-3 h-3" aria-hidden="true" />
            Competition Registration
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">
            Register Team for <GradientText>Competition</GradientText>
          </h1>
          <p className="text-white/45 text-sm">Select your team and a competition to register</p>
        </motion.div>

        {/* Step 1: Team Selection */}
        <motion.section className="mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          aria-labelledby="step1-heading">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: selectedTeam ? '#22C55E' : COLORS.saffron }}>1</div>
            <h2 id="step1-heading" className="text-lg font-bold text-white">Select Your Team</h2>
          </div>

          {teams.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <Trophy className="w-12 h-12 mx-auto mb-4 text-white/20" aria-hidden="true" />
              <p className="text-white/45 mb-4">You don't have any teams yet.</p>
              <button onClick={() => navigate('/coach/create-team')}
                className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px]"
                style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
                Create New Team
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teams.map((team) => (
                <motion.button key={team.id} onClick={() => setSelectedTeam(team.id)}
                  disabled={submitting}
                  className="text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden"
                  style={{
                    background: selectedTeam === team.id ? `#22C55E10` : COLORS.darkCard,
                    borderColor: selectedTeam === team.id ? '#22C55E60' : COLORS.darkBorderSubtle,
                    boxShadow: selectedTeam === team.id ? '0 0 30px #22C55E15' : 'none',
                  }}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-bold">{team.name}</p>
                      {team.description && <p className="text-white/40 text-sm mt-1">{team.description}</p>}
                      {team.competitions?.length > 0 && (
                        <p className="text-white/25 text-xs mt-2">
                          Registered for {team.competitions.length} competition(s)
                        </p>
                      )}
                    </div>
                    {selectedTeam === team.id && (
                      <CheckCircle className="w-5 h-5 flex-shrink-0 ml-3" style={{ color: '#22C55E' }} aria-hidden="true" />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </motion.section>

        {/* Step 2: Competition Selection */}
        <motion.section className="mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          aria-labelledby="step2-heading">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: selectedCompetition ? '#22C55E' : COLORS.saffron }}>2</div>
            <h2 id="step2-heading" className="text-lg font-bold text-white">Select Competition</h2>
          </div>

          {competitions.length > 3 && (
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search competitions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 rounded-xl text-white placeholder-white/25 outline-none min-h-[44px]"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.darkBorderSubtle}` }}
                onFocus={e => e.target.style.borderColor = COLORS.saffron}
                onBlur={e => e.target.style.borderColor = COLORS.darkBorderSubtle}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/60 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Clear search">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {filteredCompetitions.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <p className="text-white/45">No competitions found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="mt-2 text-sm hover:opacity-80"
                  style={{ color: COLORS.saffronLight }}>Clear search</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredCompetitions.map((competition) => {
                const statusStyle = getStatusStyle(competition.status);
                return (
                  <motion.button key={competition.id} onClick={() => setSelectedCompetition(competition.id)}
                    disabled={submitting}
                    className="text-left p-5 rounded-2xl border transition-all duration-200"
                    style={{
                      background: selectedCompetition === competition.id ? `${COLORS.saffron}10` : COLORS.darkCard,
                      borderColor: selectedCompetition === competition.id ? `${COLORS.saffron}60` : COLORS.darkBorderSubtle,
                      boxShadow: selectedCompetition === competition.id ? `0 0 30px ${COLORS.saffron}15` : 'none',
                    }}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-white font-bold leading-tight flex-1 pr-2">
                        {competition.name} {competition.year || ''}
                      </h3>
                      {selectedCompetition === competition.id && (
                        <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-white/45 text-xs">
                        <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span>{competition.place}</span>
                        <span>·</span>
                        <span className="capitalize">{competition.level}</span>
                      </div>
                      {competition.startDate && competition.endDate && (
                        <div className="flex items-center gap-2 text-white/45 text-xs">
                          <Calendar className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                          <span>
                            {new Date(competition.startDate).toLocaleDateString()} – {new Date(competition.endDate).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.color }}>
                        {competition.status}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* Submit */}
        <motion.div className="flex justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <motion.button
            onClick={handleSelectCompetition}
            disabled={!selectedCompetition || !selectedTeam || submitting}
            className="px-8 py-4 rounded-2xl font-bold text-white flex items-center gap-3 min-h-[52px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
            whileHover={(!selectedCompetition || !selectedTeam || submitting) ? {} : { scale: 1.02 }}
            whileTap={(!selectedCompetition || !selectedTeam || submitting) ? {} : { scale: 0.98 }}>
            {submitting ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Registering...
              </>
            ) : (
              <>
                Register Team & Continue
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </>
            )}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

export default CoachSelectCompetition;
